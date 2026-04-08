# Glossary v1 — Frozen MVP Terminology

> Authoritative definitions for the Signal MVP. If a term is defined here, this definition takes precedence over any other document in the repository. Terms not listed here are not part of the MVP vocabulary.

---

## Pipeline Objects

### Source
A monitored endpoint configuration. Represents "what to fetch, from where, how often." Sources are human-created (admin/analyst) and stored in Firestore (`sources/{sourceId}`). Each Source has a `sourceType` that describes the kind of endpoint: `web_page`, `rss_feed`, `pdf_endpoint`, `json_api`, `regulatory_feed`.

### SourceContent
A single fetched artifact from a Source at a specific point in time. Created by `services/ingest` when a delta is detected. The raw body is archived in GCS; metadata is stored in Firestore (active 30-day window) and BigQuery (permanent). SourceContent is immutable. `sourceType` on SourceContent describes the content format: `web_page`, `rss_entry`, `pdf_document`, `json_api`, `regulatory_filing`. Note: a Source of type `rss_feed` produces SourceContent of type `rss_entry`.

### SourceType
Overloaded term — context-dependent:
- **On a Source object**: the kind of endpoint being monitored (`web_page`, `rss_feed`, `pdf_endpoint`, `json_api`, `regulatory_feed`).
- **On a SourceContent object**: the kind of content record produced (`web_page`, `rss_entry`, `pdf_document`, `json_api`, `regulatory_filing`).

Always qualify which level is meant when discussing SourceType outside of code.

In BigQuery `source_contents`, these ideas are **named explicitly**: `registry_source_type` (Firestore Source), `source_type` (content record / ontology kind), and `mime_type` (HTTP `Content-Type`). See [BigQuery analytical schema v1](bigquery-analytical-schema-v1.md).

### ExtractedEvent
A candidate fact extracted from one or more SourceContent records. Created by `services/intel`. Represents "we found evidence that X happened, with Y confidence." Not visible to users. Stored in BigQuery (permanent) and Firestore (7-day TTL for dedup). Immutable once written.

### ExtractedFact
A polymorphic structured data object embedded in an ExtractedEvent. Contains family-specific fields (e.g., for a `project_award` event: `projectName`, `awardValue`, `currency`, `awardingEntity`). The schema varies by `eventFamily`. See [Event and Signal Taxonomy](event-and-signal-taxonomy-v1.md).

### Signal
A scored, normalized, board-/BI-relevant intelligence unit. The primary user-facing object. Created by `services/intel` from qualifying ExtractedEvents. Stored in Firestore (`signals/{signalId}`, 90-day TTL) as the dashboard read model and in BigQuery (permanent) as history. Signals have a lifecycle (`status`) and carry a `compositeScore` (0–100).

### SignalType
The canonical classification of a Signal. Derived 1:1 from `eventFamily` for the MVP. Canonical values: `project_award`, `investment_plan_update`, `earnings_reporting_update`, `partnership_mou`, `ma_divestment`, `technology_milestone`, `geographic_expansion`, `commodity_movement`, `policy_regulatory_change`, `tender_opportunity`. See [Event and Signal Taxonomy](event-and-signal-taxonomy-v1.md).

---

## Downstream Derivatives

### AlertRule
A user-configured condition that triggers a notification when matched by a new Signal. Stored in Firestore (`alert_rules/{ruleId}`). Contains: entity scope, signal type scope, `minScore` threshold (0–100), recipients, channel (`email` for MVP), cooldown. AlertRules are configuration objects — they do not modify or create signals.

### AlertDelivery
A record that an alert notification was sent (or attempted). Created by the alert worker. Stored in Firestore (`alert_deliveries/{deliveryId}`) and BigQuery. Links a `ruleId` to a `signalId`. Used for dedup and cooldown tracking.

### Brief
A generated daily intelligence digest. Created by the brief worker. Stored in Firestore (`briefs/{briefId}`). A Brief is a point-in-time snapshot — it does not update when signals change after generation. Contains a list of BriefItems.

### BriefItem
One Signal's representation within a Brief. Embedded in the Brief document, not a standalone collection. Captures a point-in-time snapshot of the signal's title, score, type, and source URLs at generation time.

---

## Entity Model

### Entity
A long-lived business object that users track in Signal. Entity types for the MVP: Organization, Project, Technology, Commodity, Geography. Additionally, Source, Watchlist, User, and Workspace are entity-like configuration objects. Stored in Firestore (`entities/{entityId}`). Entities use UUIDv4 as canonical IDs.

### Alias
An alternative name for an Entity. Stored as `aliases[]` on the Entity document. Each alias has a `value` (the alternative name) and a `type` (e.g., `trade_name`, `abbreviation`, `former_name`, `local_name`, `brand`, `subsidiary_name`, `ticker`, `lei`, `vat_id`, `custom`). Aliases are used for entity resolution during extraction; they are never displayed as canonical names.

### External ID
An identifier assigned to an Entity by an external system (e.g., LEI, ISIN, VAT number, stock ticker). Stored as `externalIds[]` on the Entity document. External IDs are matching hints, not primary keys. The pipeline never uses an external ID as a Firestore document key.

### Watchlist
A user-defined grouping of Entities used for filtering signals, configuring alerts, and scoping briefs. Stored in Firestore (`watchlists/{watchlistId}`). A Watchlist references entities by ID. Adding/removing entities from a watchlist does not affect signals — it only changes which signals are shown to the user in filtered views.

### Workspace
The tenant container. MVP has a single implicit Workspace. Stores workspace-level configuration: scoring weights, default brief settings, enrichment budget. Stored in Firestore (`workspaces/{workspaceId}`).

---

## Scoring Dimensions

### Relevance
How closely a Signal relates to entities the organization actively tracks. Scale: 0–100. Default weight: 30%. Higher when the signal links to entities with role `competitor` or `client`, or entities in the user's watchlist.

### Impact
How significant the signal's event type is for the business. Scale: 0–100. Default weight: 25%. Determined by signalType base score plus modifiers (e.g., disclosed monetary value, geographic proximity).

### Freshness
How recently the underlying event occurred. Scale: 0–100. Default weight: 20%. Decays over time from `signalTime.value`. 0–6 hours = 100, degrades progressively.

### Confidence
How trustworthy the extraction and entity resolution are. Scale: 0–100. Default weight: 15%. Composed from: entity match confidence (40%), extraction method quality (30%), corroboration count (15%), field completeness (15%).

### SourceAuthority
How authoritative the source is. Scale: 0–100. Default weight: 10%. Admin-assigned per Source (`sourceAuthority` field, 0–100). Multi-source signals use the maximum authority among contributing sources.

### CompositeScore
The weighted sum of all five dimensions. Integer 0–100. Formula: `round(relevance × 0.30 + impact × 0.25 + freshness × 0.20 + confidence × 0.15 + sourceAuthority × 0.10)`. Weights are configurable at the Workspace level and must sum to 1.00.

---

## Lifecycle and State

### Status (Signal)
The lifecycle state of a Signal. Canonical values:
- **`active`** — Signal is current and visible in the dashboard. Initial state after creation.
- **`acknowledged`** — User has seen and acknowledged the signal. Transition: `active → acknowledged` (user action).
- **`dismissed`** — User has explicitly dismissed the signal. Transitions: `active → dismissed`, `acknowledged → dismissed` (user action).
- **`superseded`** — A newer signal for the same event chain has replaced this one. Transition: `active → superseded` (pipeline action). The `supersededBy` field on the old signal points to the new signal's ID.
- **`expired`** — TTL reached (90 days with no update). Transition: `active → expired` (system action).

Dismissed and expired signals remain in Firestore for the read-model TTL, then exist only in BigQuery.

### Novelty
Whether a Signal represents new information or an update. Values:
- **`new`** — No prior signal exists with overlapping eventIds and entityIds.
- **`update`** — A prior signal exists for the same event chain, with new material changes.
- **`recurrence`** — The same event pattern recurs after the previous signal was dismissed or expired.

---

## Pipeline Concepts

### Provenance
The complete traceability chain from a Signal back to the raw source material: `Signal → eventIds[] → ExtractedEvent → sourceContentIds[] → SourceContent → gcsPath → raw content in GCS`. Every Signal MUST have a complete provenance chain. No signal may exist without at least one event ID. No event may exist without at least one source content ID. No source content may exist without a GCS path.

### Deduplication
The process of preventing duplicate objects in the pipeline. Achieved through deterministic IDs: if the same source content is processed twice, the same contentId is produced. If the same event is extracted twice, the same eventId is produced. If the same signal is created twice, the same signalId is produced. Firestore writes are upserts.

### Escalation
The process of invoking an LLM when deterministic methods are insufficient. Used for: low-confidence entity resolution, ambiguous event classification, signal enrichment, executive summary generation in briefs. Escalation is never the default path. The pipeline always produces a result with deterministic methods first; escalation adds optional refinement.

---

## Identifiers

### Canonical ID
The primary identifier for any object in Signal. For human-created objects (Entity, Source, Watchlist, AlertRule, Brief, etc.): UUIDv4. For pipeline-created objects (SourceContent, ExtractedEvent, Signal): deterministic SHA-256 hash of canonical normalized inputs, truncated to 32 hex characters (128 bits).

### Deterministic ID Derivation

| Object | Formula | Inputs (all must be canonical-normalized) |
|---|---|---|
| SourceContent | `sha256(sourceId + ':' + contentHash)` | sourceId (UUID), contentHash (SHA-256 of normalized body) |
| ExtractedEvent | `sha256(sourceContentIds.sorted().join(':') + ':' + eventFamily + ':' + entityIds.sorted().join(':'))` | Sorted arrays joined with `:`, fields separated by `:` |
| Signal | `sha256(eventIds.sorted().join(':') + ':' + signalType)` | Sorted eventIds joined with `:`, then `:`, then signalType enum value |

Hash inputs are always derived from canonical, normalized values — never from raw text with variable formatting. Array inputs are sorted lexicographically before hashing. The `:` separator is mandatory between all segments to prevent collision from concatenation ambiguity.
