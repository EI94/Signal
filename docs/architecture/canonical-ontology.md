# Canonical Ontology

## Purpose

This document defines the canonical data objects in Signal — their meaning, boundaries, lifecycle, and relationships. It is the single reference that guides:

- Zod schema design in `packages/contracts`
- Firestore document structure (operational read models)
- BigQuery table design (analytical history)
- GCS archive layout (raw provenance)
- Pub/Sub event payloads
- API response shapes
- Agent tool input/output contracts

The ontology is **not** a database schema. It is a semantic contract: "these are the things Signal knows about, what they mean, and how they relate." Storage-specific decisions (indexes, partitioning, TTLs) are informed by this ontology but not defined here.

---

## Design Principles

### 1. Three-Layer Pipeline Separation

Signal operates on a strict three-layer pipeline:

```
SourceContent → ExtractedEvent → Signal
   (raw)         (candidate)      (product)
```

**SourceContent** is what was fetched. **ExtractedEvent** is what was found in it. **Signal** is what gets shown to users. These are never the same object. They have different lifecycles, different storage profiles, and different audiences.

### 2. Entities Are Things You Watch; Events Are Things That Happen

Entities (Organization, Technology, Commodity, etc.) are the nouns of the system — long-lived reference objects that the user cares about. Events and signals are the verbs — temporal occurrences linked to entities. Conflating the two produces data models that can't answer either "what do I watch?" or "what happened?" cleanly.

### 3. Alerts and Briefs Are Derivatives, Not Roots

Alerts and briefs are downstream views of signals. They do not introduce new truth. An alert is "a signal matched a rule." A brief is "a curated set of signals rendered for delivery." Neither should be queryable as an independent intelligence object detached from its source signals.

### 4. IDs Are Deterministic Where Possible

Objects produced by the pipeline (ExtractedEvent, Signal) have IDs derived from content hashes and source references. This makes the pipeline idempotent: reprocessing the same source content produces the same object IDs, enabling safe deduplication.

Objects created by humans (Entity, AlertRule, User) use system-generated UUIDs because they have no natural content-addressable key.

### 5. Provenance Is Mandatory

Every signal must trace back to its extracted event(s), and every extracted event must trace back to its source content in GCS. This chain is non-negotiable. Without it, users cannot verify why a signal exists, and the system cannot explain its outputs.

### 6. MVP-Scoped, Not Minimal

The ontology covers what the MVP needs to function correctly. It does not include speculative objects for features that have no consumer in the MVP roadmap. But it does not cut corners on the objects it includes — each one is defined with enough precision to build against.

---

## Canonical Object Inventory

| Object | Layer | Created By | Stored In | Purpose |
|---|---|---|---|---|
| **Source** | Configuration | Admin/analyst via API | Firestore | Source registry: what to fetch, how often, from where |
| **SourceContent** | Pipeline | `services/ingest` | GCS (body), Firestore (metadata) | Raw fetched material and its provenance |
| **ExtractedEvent** | Pipeline | `services/intel` | BigQuery (full), Firestore (active window) | Candidate fact extracted from source content |
| **Signal** | Product | `services/intel` | Firestore (read model), BigQuery (history) | Scored, normalized intelligence unit for users |
| **Entity** | Configuration | Admin/analyst via API | Firestore | Watched business object (org, tech, commodity, etc.) |
| **Watchlist** | Configuration | User via API | Firestore | User-defined grouping of entities for filtering/alerts |
| **AlertRule** | Configuration | User via API | Firestore | Trigger condition for notifications |
| **AlertDelivery** | Operational | Alert worker | Firestore | Delivery record for a triggered alert |
| **Brief** | Derived | Brief worker | Firestore | Generated daily digest |
| **BriefItem** | Derived | Brief worker | Embedded in Brief | One signal's representation within a brief |
| **User** | Identity | Firebase Auth + API | Firebase Auth + Firestore | User identity, preferences, role |
| **Workspace** | Identity | System | Firestore | Tenant container (single for MVP) |

---

## Object Definitions

### A. SourceContent

**What it is:** The raw material fetched from a monitored source at a specific point in time. A SourceContent record represents one fetch of one source that detected a change.

**What it is NOT:** An interpreted or summarized view of the source. SourceContent is pre-interpretation.

**Canonical fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `contentId` | string | yes | Deterministic: `sha256(sourceId + ':' + contentHash)` |
| `sourceId` | string | yes | FK to Source |
| `sourceType` | enum | yes | `web_page`, `pdf_document`, `rss_entry`, `json_api`, `regulatory_filing`. Note: a Source with `sourceType: 'rss_feed'` produces SourceContent records with `sourceType: 'rss_entry'`. See [Entity Taxonomy](entity-taxonomy-v1.md) for Source-level types. |
| `contentHash` | string | yes | SHA-256 of normalized fetched body |
| `sourceUrl` | string | yes | URL fetched |
| `gcsPath` | string | yes | Full GCS path to archived raw content |
| `fetchedAt` | timestamp | yes | When the content was fetched |
| `publishedAt` | timestamp | no | Publication date if detectable from source |
| `deltaType` | enum | yes | `new` or `changed` |
| `previousContentId` | string | no | Previous version's contentId (null on first fetch) |
| `extractionStatus` | enum | yes | `pending`, `completed`, `failed`, `skipped` |
| `contentSizeBytes` | integer | no | Raw content size |

**Storage:**
- **GCS:** Full raw body. Path: `gs://signal-archive/{sourceType}/{sourceId}/{YYYY-MM-DD}/{timestamp}.{ext}` (timestamp is fetch time in ISO compact format; contentId is not used in the path because the hash is stored as metadata on the GCS object)
- **Firestore:** Metadata only in `source_contents/{contentId}` for active-window lookups (last 30 days). Older records exist only in BigQuery.
- **BigQuery:** Full metadata row in `source_contents` table, partitioned by `fetchedAt`.

**Lifecycle:** SourceContent is immutable after creation. It is never updated, only superseded by a newer fetch.

### B. ExtractedEvent

**What it is:** A candidate fact extracted from one or more SourceContent records. An ExtractedEvent represents "we found evidence that X happened" — it is not yet a product-facing signal. It may be ambiguous, low-confidence, or a duplicate of a previously extracted event.

**What it is NOT:** A user-facing intelligence item. Users never see ExtractedEvents directly. They see Signals, which are refined and scored downstream products of ExtractedEvents.

**Canonical fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `eventId` | string | yes | Deterministic: `sha256(sourceContentIds.sorted().join(':') + ':' + eventFamily + ':' + entityIds.sorted().join(':'))` |
| `eventFamily` | enum | yes | See [Event and Signal Taxonomy](event-and-signal-taxonomy-v1.md) |
| `sourceContentIds` | string[] | yes | One or more SourceContent records that provide evidence |
| `entityIds` | string[] | yes (may be empty) | Entities mentioned or implicated. Empty = unresolved. |
| `entityMatchConfidences` | map<string, number> | yes | Per-entity confidence of the match (0–100) |
| `extractedFacts` | object | yes | Family-specific structured data (see taxonomy) |
| `rawExcerpts` | string[] | yes | Key text passages that constitute evidence (max 3, max 500 chars each) |
| `eventTime` | object | yes | `{ value: timestamp, precision: 'day' \| 'month' \| 'quarter' \| 'year' \| 'unknown' }` |
| `detectedAt` | timestamp | yes | When the pipeline extracted this event |
| `confidence` | integer | yes | Overall extraction confidence (0–100) |
| `ambiguityNotes` | string[] | no | Machine-generated notes about what was unclear |
| `extractionMethod` | enum | yes | `deterministic`, `model_assisted` |
| `enrichmentStatus` | enum | yes | `none`, `requested`, `completed`, `failed` |

**Storage:**
- **BigQuery:** Full record in `extracted_events` table, partitioned by `detectedAt`. This is the primary persistent store.
- **Firestore:** Only events in the active processing window (last 7 days) live in `extracted_events/{eventId}` for dedup lookups during pipeline processing. They are TTL-cleaned.

**Lifecycle:** ExtractedEvents are immutable once written. If the pipeline reprocesses a source and extracts the same event, the deterministic ID ensures it overwrites identically. If extraction logic changes and produces a different event, the new event gets a different ID.

### C. Signal

**What it is:** A scored, normalized intelligence unit that represents a board-/BI-relevant development. A Signal is the product-facing object that users interact with in the dashboard, receive in alerts, and see in briefs.

**What it is NOT:** Raw extraction output. A Signal has been deduplicated, scored, linked to entities, and assigned a lifecycle status. It is the pipeline's opinion on "this matters."

**Canonical fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `signalId` | string | yes | Deterministic: `sha256(eventIds.sorted().join(':') + ':' + signalType)` |
| `signalType` | enum | yes | See [Event and Signal Taxonomy](event-and-signal-taxonomy-v1.md) |
| `title` | string | yes | Human-readable summary (≤ 200 chars). Deterministically generated, not LLM. |
| `body` | string | yes | Structured description (≤ 2000 chars) |
| `entityIds` | string[] | yes | Linked entities. At least one required for signal creation. Unresolved events (no entity match) do not produce signals. |
| `primaryEntityId` | string | no | The single most relevant entity, if determinable |
| `eventIds` | string[] | yes | Source ExtractedEvent(s) that produced this signal |
| `sourceContentIds` | string[] | yes | Transitive: all SourceContent records behind the events |
| `sourceUrls` | string[] | yes | Original URLs for user-facing source attribution |
| `scores` | object | yes | See [Scoring Model](scoring-model-v1.md) |
| `compositeScore` | integer | yes | Weighted composite (0–100) |
| `signalTime` | object | yes | `{ value: timestamp, precision: ... }` inherited from event |
| `detectedAt` | timestamp | yes | When the signal was first produced |
| `scoredAt` | timestamp | yes | When scoring was last computed |
| `status` | enum | yes | `active`, `acknowledged`, `dismissed`, `superseded`, `expired` |
| `novelty` | enum | yes | `new`, `update`, `recurrence` |
| `supersededBy` | string | no | signalId of the newer signal that supersedes this one |
| `enrichment` | object | no | LLM-provided enrichment data, if any |
| `tags` | string[] | no | System-generated or admin-applied tags |

**Status lifecycle:**

```
new signal → active
      active → acknowledged   (user action)
      active → dismissed      (user action)
      active → superseded     (pipeline detects newer signal for same event chain)
      active → expired        (TTL: 90 days with no update)
acknowledged → dismissed      (user action)
```

`dismissed` and `expired` signals remain in Firestore for the read-model TTL (90 days), then exist only in BigQuery.

**Novelty rules:**
- `new`: No prior signal exists with overlapping eventIds and entityIds.
- `update`: A prior signal exists for the same event chain, and the new data changes scores or facts materially.
- `recurrence`: The same event pattern recurs after the previous signal was dismissed or expired.

**Storage:**
- **Firestore:** `signals/{signalId}` — full document, TTL 90 days from last `scoredAt`. This is the dashboard read model.
- **BigQuery:** `signals` table — full row, partitioned by `detectedAt`. Permanent history.

### D. AlertRule

**What it is:** A user-configured condition that, when matched by a new signal, triggers a notification.

**Canonical fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `ruleId` | string | yes | System-generated UUID |
| `createdBy` | string | yes | User ID |
| `name` | string | yes | Human-readable rule name |
| `entityIds` | string[] | yes | Entities to watch (at least one) |
| `signalTypes` | string[] | no | Signal types to match (empty = all types) |
| `minScore` | integer | yes | Minimum composite score threshold (0–100) |
| `channel` | enum | yes | `email` (MVP only) |
| `recipients` | string[] | yes | Email addresses |
| `cooldownMinutes` | integer | yes | Min time between alerts for the same rule. Default: 60. |
| `active` | boolean | yes | Whether the rule is currently active |
| `createdAt` | timestamp | yes | |
| `updatedAt` | timestamp | yes | |

**Deduplication:** An alert is not sent if the same `(ruleId, signalId)` pair already has a delivery record. Cooldown prevents alert fatigue when multiple signals fire in rapid succession for the same rule.

**Explainability:** Every triggered alert must include: which rule matched, which signal triggered it, why the signal's score met the threshold, and which entities are involved. The email body must render this transparently.

**Storage:** Firestore `alert_rules/{ruleId}`.

### E. AlertDelivery

**What it is:** A record that an alert was (or was attempted to be) delivered.

| Field | Type | Required | Description |
|---|---|---|---|
| `deliveryId` | string | yes | System-generated UUID |
| `ruleId` | string | yes | FK to AlertRule |
| `signalId` | string | yes | FK to Signal |
| `recipient` | string | yes | Email address |
| `status` | enum | yes | `sent`, `failed`, `skipped_cooldown`, `skipped_dedup` |
| `sentAt` | timestamp | no | When delivery was confirmed |
| `failureReason` | string | no | If status = failed |
| `createdAt` | timestamp | yes | |

**Storage:** Firestore `alert_deliveries/{deliveryId}`. Also appended to BigQuery `alert_deliveries` for historical analysis.

### F. Brief

**What it is:** A generated daily intelligence digest delivered to users. A Brief is a snapshot of the signal landscape at generation time, not a living document.

| Field | Type | Required | Description |
|---|---|---|---|
| `briefId` | string | yes | System-generated UUID |
| `generatedAt` | timestamp | yes | |
| `periodStart` | timestamp | yes | Start of the coverage window |
| `periodEnd` | timestamp | yes | End of the coverage window |
| `recipientUserId` | string | yes | |
| `recipientEmail` | string | yes | |
| `items` | BriefItem[] | yes | Ordered list of signal summaries |
| `executiveSummary` | string | no | LLM-generated summary (escalation path only) |
| `signalCount` | integer | yes | Total signals considered |
| `deliveredSignalCount` | integer | yes | Signals included in the brief |
| `deliveryStatus` | enum | yes | `sent`, `failed`, `empty_skipped` |

**Storage:** Firestore `briefs/{briefId}`.

### G. BriefItem

**What it is:** One signal's representation within a brief. It is NOT a copy of the signal; it is a rendering reference with brief-specific metadata.

| Field | Type | Required | Description |
|---|---|---|---|
| `signalId` | string | yes | FK to Signal |
| `rank` | integer | yes | Position in the brief (1-based) |
| `title` | string | yes | Signal title at time of generation |
| `compositeScore` | integer | yes | Score at time of generation |
| `signalType` | string | yes | |
| `entityIds` | string[] | yes | |
| `sourceUrls` | string[] | yes | For direct links in the email |
| `dashboardUrl` | string | yes | Deep link to signal in dashboard |

BriefItem is embedded in Brief, not a standalone collection. It captures a point-in-time snapshot. If the signal's score changes later, the brief item is unaffected — it records what was true when the brief was generated.

---

## Required vs Optional Fields Guidance

**Required means:** The pipeline MUST produce this field for the object to be valid. If the field cannot be populated, the object should not be created (or should be flagged as degraded).

**Optional means:** The field adds value when present but is not needed for the object to function in the pipeline. Optional fields are never used as filter keys in core dashboard queries — they are supplementary.

**Rule:** A field is required if:
1. It is needed for deduplication (IDs, hashes)
2. It is needed for scoring (entityIds, eventFamily, sourceAuthority)
3. It is needed for provenance (sourceContentIds, gcsPath)
4. It is needed for display in the core dashboard (title, signalType, compositeScore)

Everything else is optional for MVP.

---

## Normalization Rules

### Text normalization
- All text fields are stored as UTF-8.
- Leading/trailing whitespace is stripped.
- Consecutive whitespace is collapsed to single spaces.
- HTML entities are decoded. HTML tags are stripped from plain-text fields.
- Titles are sentence-cased (first word capitalized, rest lowercase unless proper noun).

### Timestamp normalization
- All timestamps are stored as UTC ISO 8601 with millisecond precision.
- Timestamps with timezone info are converted to UTC.
- Timestamps without timezone are treated as UTC and flagged with `precision: 'unknown'` on the eventTime/signalTime object.
- "Published date" fields from sources that provide only a date (no time) are stored as `T00:00:00.000Z` with `precision: 'day'`.

### Entity name normalization
- Canonical entity names are stored in their official form (e.g., "Eni S.p.A.", not "ENI" or "eni spa").
- Aliases cover common variants and are used for matching, not for display.
- See [Relationships and Identity](relationships-and-identity-v1.md) for full alias rules.

### URL normalization
- URLs are stored with protocol (`https://`).
- Trailing slashes are stripped unless they are semantically significant.
- Query parameters are preserved (they may identify specific pages or filings).
- Fragment identifiers (`#section`) are stripped.

---

## Lifecycle and State Guidance

### Immutable objects
**SourceContent** and **ExtractedEvent** are append-only. Once written, they are never modified. If reprocessing produces different results, the new output gets a different deterministic ID.

### Mutable-state objects
**Signal** has a `status` field that changes over its lifecycle (active → acknowledged → dismissed → expired). Status changes are user-driven (acknowledge, dismiss) or system-driven (superseded, expired). Score recalculation may update `compositeScore` and `scoredAt`.

### Configuration objects
**Entity**, **Source**, **AlertRule**, **Watchlist**, **User** are CRUD-managed through `apps/api`. They have `createdAt` and `updatedAt` timestamps. Soft deletion is preferred over hard deletion for audit trail (add `deletedAt` field).

---

## Provenance Requirements

Every Signal must support the following provenance query:

> "Why does this signal exist? What source material supports it?"

The answer is always traceable:

```
Signal.signalId
  → Signal.eventIds[]
    → ExtractedEvent.sourceContentIds[]
      → SourceContent.gcsPath
        → raw content in GCS
```

This chain MUST be navigable from the dashboard. The API must expose endpoints that allow drilling from a signal down to its source evidence.

No signal may exist without at least one event ID. No event may exist without at least one source content ID. No source content may exist without a GCS path.

---

## Versioning Philosophy

### Ontology versioning
This document defines the **v1** ontology. If a breaking change is needed (e.g., renaming a field that crosses a service boundary, restructuring the event hierarchy), a new version is created:
- The new version is documented as `canonical-ontology-v2.md`.
- Both versions coexist during migration.
- BigQuery tables may have both v1 and v2 rows during transition.
- Firestore documents are migrated in-place with a `_schemaVersion` field.

### Field-level evolution
Adding optional fields to an existing object is NOT a breaking change and does not require a new ontology version. Removing a field or changing a required field's type IS breaking.

### Contract alignment
When the Zod schemas in `packages/contracts` are implemented, they MUST correspond 1:1 with this ontology. The ontology document is the design; the Zod schemas are the implementation. If they diverge, the ontology document wins and the schemas must be corrected.

---

## MVP Scope

### In scope for MVP

| Object | Status |
|---|---|
| Source | Full CRUD |
| SourceContent | Created by pipeline, metadata queryable |
| ExtractedEvent | Created by pipeline, stored for dedup and provenance |
| Signal | Full lifecycle, dashboard read model, scoring |
| Entity (Organization, Project, Technology, Commodity, Geography) | Full CRUD with alias support |
| Watchlist | Create, assign entities, use for filtering |
| AlertRule | CRUD, email delivery |
| AlertDelivery | Created by alert worker |
| Brief / BriefItem | Generated daily, archived |
| User | Firebase Auth + preferences |
| Workspace | Single implicit workspace |

### Deferred post-MVP

| Concept | Why deferred |
|---|---|
| Person entity | Not justified for MVP; see [Entity Taxonomy](entity-taxonomy-v1.md) |
| Signal threading / conversation | Requires UX design for signal grouping; MVP uses `supersededBy` for simple chaining |
| Entity merge / split operations | Complex identity operations; MVP uses manual alias management |
| Signal sentiment scoring | Requires model-assisted assessment; MVP scores on structural dimensions only |
| Custom event family definitions | MVP uses fixed taxonomy; extensibility is post-MVP |
| Collaborative annotations | Users cannot comment on or annotate signals in MVP |
| Audit log as first-class object | BigQuery history serves as implicit audit; dedicated audit log is post-MVP |

---

## Cross-References

- [Entity Taxonomy v1](entity-taxonomy-v1.md) — detailed entity type definitions
- [Event and Signal Taxonomy v1](event-and-signal-taxonomy-v1.md) — event families and signal types
- [Relationships and Identity v1](relationships-and-identity-v1.md) — IDs, aliases, deduplication
- [Scoring Model v1](scoring-model-v1.md) — scoring dimensions and weighting
- [ADR-0003](../../adr/ADR-0003-canonical-ontology-and-signal-model.md) — ontology design decisions
