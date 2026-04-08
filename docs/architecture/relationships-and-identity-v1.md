# Relationships and Identity v1

This document defines how objects in Signal are identified, linked, deduplicated, and how ambiguous real-world identities are resolved.

---

## Canonical IDs

Every object in Signal has a canonical ID. The ID strategy depends on whether the object is created by humans or by the pipeline.

### Human-Created Objects (UUIDs)

| Object | ID Field | Format | Example |
|---|---|---|---|
| Entity (all types) | `entityId` | UUIDv4 | `a3b1c2d4-e5f6-7890-abcd-ef1234567890` |
| Source | `sourceId` | UUIDv4 | |
| Watchlist | `watchlistId` | UUIDv4 | |
| AlertRule | `ruleId` | UUIDv4 | |
| AlertDelivery | `deliveryId` | UUIDv4 | |
| Brief | `briefId` | UUIDv4 | |
| User | `userId` | Firebase Auth UID | `firebase-uid-string` |
| Workspace | `workspaceId` | UUIDv4 | |

UUIDs are used because human-created objects have no natural content-addressable key. A UUID is generated once at creation time and never changes.

### Pipeline-Created Objects (Deterministic Hashes)

| Object | ID Field | Derivation | Purpose |
|---|---|---|---|
| SourceContent | `contentId` | `sha256(sourceId + ':' + contentHash)` | Same source + same content = same ID. Idempotent fetches. |
| ExtractedEvent | `eventId` | `sha256(sourceContentIds.sorted().join(':') + ':' + eventFamily + ':' + entityIds.sorted().join(':'))` | Same evidence + same classification = same ID. Idempotent extraction. |
| Signal | `signalId` | `sha256(eventIds.sorted().join(':') + ':' + signalType)` | Same events + same type = same signal. Idempotent signal creation. |

**Why deterministic IDs matter:**
- **Idempotency:** Reprocessing the same source content through the pipeline produces the same IDs. Firestore writes are upserts. No duplicate signals from retries.
- **Deduplication:** Before creating an object, the pipeline can check if the deterministic ID already exists. This is O(1) in Firestore.
- **Traceability:** The ID itself encodes the provenance chain. Given a signalId, you can reconstruct which events and which source content produced it.

**Hash format:** The `sha256()` produces a hex string. For readability and Firestore key friendliness, IDs are truncated to the first 32 hex characters (128 bits). Collision probability at this length is negligible for the data volumes Signal handles.

---

## External Identifiers

Entities in the real world have identifiers assigned by external systems. Signal stores these as structured external ID maps, not as part of the canonical ID.

### External ID Structure

Each entity may have zero or more external identifiers:

| Field | Type | Description |
|---|---|---|
| `system` | string | The external system (e.g., `lei`, `isin`, `ticker_nyse`, `ticker_borsa_italiana`, `vat_it`, `company_register_it`, `iso_3166`, `custom`) |
| `value` | string | The identifier value (e.g., `549300X5TPMOC4GZ6Y52` for an LEI) |

External IDs are stored in an `externalIds[]` array on the Entity document.

**Rules:**
1. External IDs are for matching and enrichment, not for primary identification. The system never uses an external ID as a Firestore document key.
2. External IDs may not be unique globally — two entities might theoretically share a legacy system ID. The system tolerates this and uses external IDs as hints, not as authoritative keys.
3. External IDs are maintained by admins. The pipeline does not auto-assign external IDs (it may suggest them during enrichment, but human confirmation is required).

### Common External ID Types for Energy Sector

| System | Applies to | Example |
|---|---|---|
| `lei` | Organization | Legal Entity Identifier (20-char alphanumeric) |
| `isin` | Organization | International Securities Identification Number |
| `ticker_nyse` | Organization | NYSE ticker symbol |
| `ticker_borsa_italiana` | Organization | Borsa Italiana ticker |
| `vat_it` | Organization | Italian VAT number |
| `company_register_it` | Organization | Italian company register number |
| `iso_3166` | Geography | Country code |
| `iso_3166_2` | Geography | Country subdivision code |
| `commodity_ticker` | Commodity | Exchange ticker (e.g., `CL` for crude oil on NYMEX) |

---

## Alias Handling

Aliases are the primary mechanism for entity resolution. When the pipeline encounters a name in source content, it matches against canonical names AND aliases to resolve entities.

### Alias Structure

Each entity has an `aliases[]` array:

| Field | Type | Required | Description |
|---|---|---|---|
| `value` | string | yes | The alias text |
| `type` | enum | yes | `trade_name`, `abbreviation`, `former_name`, `local_name`, `ticker`, `lei`, `brand`, `subsidiary_name`, `custom` |
| `context` | string | no | Clarification (e.g., "Pre-2024 name", "Used in Italian press", "CEO name, as of 2025") |
| `active` | boolean | yes | Whether this alias should be used for matching. Default: true. Deactivated aliases remain for audit but don't participate in entity resolution. |

### Alias Matching Rules

Entity resolution in `services/intel` follows this precedence order:

1. **Exact match on external IDs.** If the source content contains a known LEI, ISIN, or ticker, match to the entity that owns it. Confidence: 100.
2. **Exact match on canonical name.** Case-insensitive, whitespace-normalized. Confidence: 95.
3. **Exact match on active alias value.** Case-insensitive, whitespace-normalized. Confidence: 90.
4. **Token-overlap match on canonical name or alias.** Tokenize both the source text and the entity name, compute Jaccard similarity. Confidence: proportional to similarity score, capped at 80.
5. **Fuzzy match (edit distance).** For short names (≤ 3 tokens), compute Levenshtein distance. If distance ≤ 2 characters, match. Confidence: 60–70 depending on distance.
6. **No match.** If none of the above succeeds, the entity mention is unresolved. The event is still created but with empty `entityIds` or low-confidence matches flagged in `ambiguityNotes`.

**Threshold for signal creation:** Entity match confidence must be ≥ 50 for the entity to appear in a signal's `entityIds`. Matches below 50 are logged on the ExtractedEvent but do not propagate to the Signal.

### Alias Collision Handling

Two different entities may have overlapping aliases (e.g., "EDP" could be "Energias de Portugal" or "Electronic Data Processing"). When the pipeline finds a match against an alias that belongs to multiple entities:

1. Score each candidate entity using context clues (sector, geography, co-occurring entity mentions in the same content).
2. If one candidate scores significantly higher (≥ 20 points above the next), use it. Confidence: based on the context score.
3. If candidates are tied, assign the event to ALL candidates with reduced confidence (confidence / number of candidates). Flag `ambiguityNotes: ["Ambiguous entity match: multiple candidates for '{alias}'"]`.
4. If LLM enrichment is enabled and confidence is below threshold, escalate to model-assisted disambiguation.

### Aliases for Specific Entity Types

**Organizations — Subsidiaries and Brands:**
- A subsidiary is modeled as a separate Organization entity with `parentEntityId` pointing to the parent.
- The parent entity SHOULD have the subsidiary's name as an alias with `type: 'subsidiary_name'` if signals about the subsidiary should also surface when filtering for the parent.
- Example: Entity "TotalEnergies SE" has alias `{ value: "SunPower", type: "subsidiary_name" }`. A signal about SunPower will match both the SunPower entity (if it exists) and TotalEnergies (via alias).
- If both parent and subsidiary are tracked as separate entities, the signal links to the most specific match. It does NOT auto-link to both — that would double-count.

**Organizations — Reorganizations and Name Changes:**
- When a company changes its name (e.g., "Total" → "TotalEnergies"), the entity is updated:
  - `canonicalName` becomes the new name
  - The old name is added as an alias with `type: 'former_name'` and `context: 'Used until 2021'`
- No new entity is created. The entity ID stays the same. All historical signals remain linked.

**Technologies — Multiple Names:**
- Technologies often have overlapping names and abbreviations. Each variant is a separate alias.
- Example: Entity "Carbon Capture, Utilization, and Storage" has aliases: `CCS`, `CCUS`, `Carbon Capture and Storage`, `Cattura e stoccaggio del carbonio` (Italian).
- The pipeline matches on any of these.

**Commodities — Tickers and Regional Names:**
- Commodities have standardized tickers (stored as external IDs) and multiple regional/colloquial names (stored as aliases).
- Example: Entity "Brent Crude Oil" has external ID `{ system: 'commodity_ticker', value: 'BRN' }` and aliases `Brent`, `North Sea Brent`, `Petrolio Brent`.

---

## Deduplication Principles

### SourceContent Dedup
- **Key:** `contentId = sha256(sourceId + ':' + contentHash)`
- **Rule:** Same source + same content hash = same content. No duplicate processing.
- **Enforced by:** `services/ingest` checks content hash before archiving.

### ExtractedEvent Dedup
- **Key:** `eventId = sha256(sourceContentIds.sorted().join(':') + ':' + eventFamily + ':' + entityIds.sorted().join(':'))`
- **Rule:** Same source evidence + same event type + same entities = same event.
- **Challenge:** If entity resolution is non-deterministic (fuzzy matching returns different results on retry), the eventId changes. Mitigation: entity resolution uses deterministic rules (exact match, Jaccard, edit distance). Non-deterministic LLM resolution is post-processing enrichment that updates the event, not a different event.

### Signal Dedup
- **Key:** `signalId = sha256(eventIds.sorted().join(':') + ':' + signalType)`
- **Rule:** Same events + same type = same signal.
- **Cross-source dedup (MVP simplified):** When multiple sources report the same real-world development within 72 hours, the pipeline may create multiple ExtractedEvents (one per source). These produce different signalIds because their eventIds differ. To handle this, the pipeline checks for existing active signals with:
  - Same `signalType`
  - Overlapping `entityIds` (Jaccard ≥ 0.5)
  - `detectedAt` within the dedup window (72h default, configurable)
  If a match is found, the new signal is marked `novelty: 'update'`, and the older signal's `status` becomes `superseded` with its `supersededBy` field pointing to the new signal's ID. The new signal becomes the active one. If the older signal had a higher composite score, the new signal inherits the higher score for ranking continuity.

### Alert Dedup
- **Key:** `(ruleId, signalId)` pair.
- **Rule:** One alert delivery per rule per signal. Enforced by checking existing AlertDelivery records before sending.
- **Cooldown:** Even if a different signal matches the same rule, if the last delivery for that rule was within `cooldownMinutes`, the delivery is recorded as `status: 'skipped_cooldown'`.

---

## Relationship Modeling

### Source → SourceContent
- **Cardinality:** One Source → many SourceContents (one per fetch that detected a change).
- **Direction:** SourceContent references Source via `sourceId`.
- **Storage:** SourceContent is not embedded in Source. It is a separate document/row.

### SourceContent → ExtractedEvent
- **Cardinality:** One SourceContent → zero or many ExtractedEvents. One ExtractedEvent → one or many SourceContents.
- **Direction:** ExtractedEvent references SourceContent via `sourceContentIds[]`.
- **Note:** The many-to-many relationship exists because multiple sources can provide evidence for the same event. In MVP, most events will have a single sourceContentId.

### ExtractedEvent → Signal
- **Cardinality:** One ExtractedEvent → zero or one Signal. One Signal → one or more ExtractedEvents.
- **Direction:** Signal references ExtractedEvent via `eventIds[]`.

### Entity → Signal
- **Cardinality:** Many-to-many. A signal may reference multiple entities. An entity may be referenced by many signals.
- **Direction:** Signal references Entity via `entityIds[]`. Entity does NOT have a `signalIds[]` field — that would be an unbounded list and a storage anti-pattern in Firestore.
- **Query direction:** "All signals for entity X" is a query: `signals where entityIds contains X`. This requires a Firestore array-contains index on `entityIds`.

### Entity → Entity
- **Subsidiary:** Organization → Organization via `parentEntityId`. One-directional: child points to parent.
- **Geography hierarchy:** Geography → Geography via `parentGeographyId`.
- **No other entity-to-entity relationships are modeled for MVP.** Relationships like "Organization X partners with Organization Y" are modeled as signals (partnership events), not as entity-level links. This avoids maintaining a separate relationship graph and ensures all relationship data has provenance (it came from a signal, which came from a source).

### Entity → Watchlist
- **Cardinality:** Many-to-many. An entity can be in multiple watchlists. A watchlist contains multiple entities.
- **Direction:** Watchlist references Entity via `entityIds[]`. Entity does NOT have a `watchlistIds[]` field.
- **Note:** Watchlists are user-scoped. The same entity may appear in different users' watchlists.

### Signal → AlertRule → AlertDelivery
- **Direction:** AlertDelivery references both `ruleId` and `signalId`. The Signal does NOT reference alerts. The AlertRule does NOT reference signals.
- **This is deliberate.** Signals exist independently of alerts. Alert rules are evaluated against signals at scoring time. The AlertDelivery record is the join point.

### Signal → Brief/BriefItem
- **Direction:** BriefItem references `signalId`. The Signal does NOT reference briefs.
- **This is deliberate.** Briefs are downstream rendering artifacts. The signal doesn't know or care that it was included in a brief.

---

## Identity Resolution Caveats

### The Subsidiary Problem

In the energy sector, large companies have hundreds of subsidiaries, joint ventures, and project companies. "Enel" might appear as "Enel Green Power", "Enel X", "Enel Produzione", "3Sun", or "Gridspertise" depending on the source.

**MVP approach:**
1. Model the top-level company and key subsidiaries as separate entities with `parentEntityId` links.
2. Add subsidiary names as aliases on the parent if the user wants parent-level aggregation.
3. Do NOT attempt automatic subsidiary tree resolution from registration databases. This is a data quality project, not a pipeline feature.
4. The admin decides which subsidiaries are important enough to track separately. The rest are captured as aliases on the parent.

### The Consortium Problem

Energy projects are often awarded to consortia: "A consortium led by Org A, including Org B and Org C, was awarded...". The consortium itself is not an entity — it's a relationship expressed in an event.

**MVP approach:**
1. The ExtractedEvent lists all named organizations in its `extractedFacts`.
2. Entity resolution matches each organization independently.
3. The resulting Signal may have multiple `entityIds` (one for each matched consortium member).
4. No "Consortium" entity type exists. Consortia are emergent from multi-entity events.

### The Name Ambiguity Problem

"EDP" — is it Energias de Portugal or an unrelated organization? "Shell" — Royal Dutch Shell, or a subsidiary, or a completely different company named Shell?

**MVP approach:**
1. Context-based disambiguation: sector and geography of the source provide strong signals. A source about European energy referencing "EDP" almost certainly means Energias de Portugal.
2. Co-occurrence: if "EDP" appears alongside "Portugal" or "Iberian Peninsula" in the same content, confidence increases for the energy company.
3. When disambiguation fails, the event is created with multiple candidate entities at reduced confidence.
4. LLM escalation is available for persistent ambiguities.

### The Language Problem

Sources may be in Italian, English, French, German, or other languages. Entity names appear in different forms:
- "Enel" (universal), "Eni" (universal), "Ente Nazionale Idrocarburi" (Italian full name)
- "European Commission" (English), "Commissione Europea" (Italian)

**MVP approach:**
1. Aliases include `local_name` variants for key languages.
2. The pipeline normalizes text to a common representation before matching (Unicode normalization, case folding).
3. Full machine translation is NOT in scope for MVP. The pipeline works with the source text as-is and relies on aliases in the matching language.

### The Temporal Problem

Entity identity changes over time: companies rebrand, merge, split, or restructure. Historical signals should remain linked to the correct entity even after a name change.

**MVP approach:**
1. Name changes are alias updates, not entity splits. The entity ID persists.
2. Mergers: if Org A acquires Org B, Org B's entity gets `active: false` and a `former_name` alias is added to Org A. Historical signals for Org B remain linked to Org B's entity. New signals go to Org A.
3. Demergers: if Org A splits into Org A' and Org B', Org A is updated and a new entity Org B' is created. Historical signals stay with the original entity.
4. Full historical entity lineage tracking is post-MVP.

---

## Many-to-Many Summary

| Relationship | Direction | Storage Pattern |
|---|---|---|
| Source → SourceContent | 1:N | `sourceId` FK on SourceContent |
| SourceContent → ExtractedEvent | M:N | `sourceContentIds[]` on ExtractedEvent |
| ExtractedEvent → Signal | M:N (but usually 1:1 or N:1) | `eventIds[]` on Signal |
| Entity → Signal | M:N | `entityIds[]` on Signal; query with `array-contains` |
| Entity → Watchlist | M:N | `entityIds[]` on Watchlist; query with `array-contains` |
| Entity → Entity (parent) | 1:N | `parentEntityId` FK on child |
| Geography → Geography (parent) | 1:N | `parentGeographyId` FK on child |
| Signal → AlertDelivery | 1:N | `signalId` FK on AlertDelivery |
| AlertRule → AlertDelivery | 1:N | `ruleId` FK on AlertDelivery |
| Signal → BriefItem | 1:N | `signalId` FK on BriefItem (embedded in Brief) |
