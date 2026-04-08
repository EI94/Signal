# Data Flow v2

> Supersedes [Data Flow v1](data-flow-v1.md). Aligned with the [Canonical Ontology](canonical-ontology.md) three-layer pipeline, the [Scoring Model v1](scoring-model-v1.md) (0–100 integer scale, 5 dimensions), and the frozen MVP terminology in the [Glossary](glossary-v1.md).

This document describes the end-to-end data flows in Signal, from source ingestion through dashboard serving, alerts, daily briefs, and agent interactions.

---

## Pipeline Overview

Orchestration boundaries (scheduled run, Pub/Sub handoff envelope, idempotency key helpers, DLQ baseline) are described in [Orchestration v1](orchestration-v1.md).

```
Cloud Scheduler
       │
       ▼
 services/ingest ──▶ GCS (raw archive)
       │
  Pub/Sub: source.delta.detected
       │
       ▼
 services/intel
       │
       ├── 1. Parse → SourceContent metadata written
       ├── 2. Extract → ExtractedEvent(s) created
       ├── 3. Promote → Signal(s) created, scored
       ├── 4. Evaluate → AlertRule matching
       │
       ├──▶ Firestore (signals read model, extracted_events active window)
       ├──▶ BigQuery (source_contents, extracted_events, signals history)
       └──▶ Pub/Sub: signal.scored, alert.triggered
                          │
                          ▼
                    Alert worker ──▶ Resend (email)

 Cloud Scheduler (daily) ──▶ Brief worker ──▶ Resend (email)
```

The three canonical pipeline objects are:
1. **SourceContent** — raw fetched material (owned by Ingestion)
2. **ExtractedEvent** — candidate fact (owned by Intel)
3. **Signal** — scored product-facing intelligence unit (owned by Intel)

See [Canonical Ontology](canonical-ontology.md) for full object definitions.

---

## 1. Ingestion Flow

**Owner:** `services/ingest`
**Trigger:** Cloud Scheduler fires per-source on configured cadence.

```
Cloud Scheduler
    │
    ▼
services/ingest (Cloud Run)
    │
    ├── 1. Read source config from Firestore
    │      sources/{sourceId}: url, sourceType, fetchFrequency, lastContentHash
    │
    ├── 2. Fetch source content (HTTP GET, API call, RSS pull)
    │      On failure → increment consecutiveFailures, publish source.fetch.failed, STOP
    │
    ├── 3. Compute content hash (SHA-256 of normalized body)
    │
    ├── 4. Compare hash with lastContentHash
    │      Unchanged → update lastFetchedAt, STOP
    │      Changed → continue
    │
    ├── 5. Archive raw content to GCS
    │      Bucket: gs://{project}-signal-{env}-raw (Terraform). Object key (raw snapshot):
    │      raw/source/{sourceId}/date={YYYY-MM-DD}/{source_content_id}.{ext}
    │      Deterministic naming + manifests: [gcs-source-archive-v1.md](gcs-source-archive-v1.md)
    │      Object metadata: contentHash, fetchedAt, sourceUrl, sourceType (ingestion-defined)
    │
    ├── 6. Write SourceContent metadata
    │      Firestore: source_contents/{contentId} (active window, 30-day TTL)
    │      BigQuery: source_contents table (permanent)
    │      contentId = sha256(sourceId + ':' + contentHash), truncated to 32 hex chars
    │
    ├── 7. Update Source state in Firestore
    │      lastContentHash, lastFetchedAt, lastGcsPath, fetchStatus = 'healthy'
    │
    └── 8. Publish to Pub/Sub (topic default: `source.delta.detected`, Terraform) **after** GCS + BigQuery succeed
           Payload: `SourceContentPersistedEvent` v1 JSON (`source_content.persisted`) — see `@signal/contracts`.
           Includes `sourceContentId`, `registrySourceType`, `sourceType` (content record kind), `archivedGcsUri`, `manifestGcsUri`, `contentHash`, `mimeType`, `observedAt`, `emittedAt`, etc. **No raw bodies.**
           Opt-in via `SIGNAL_PUBLISH_SOURCE_CONTENT_EVENTS_ENABLED`; local dev defaults to off.
```

**Idempotency:** contentId is deterministic. Re-fetching identical content produces the same hash → same contentId → Firestore upsert is a no-op.

**Delta detection granularity:**

| Source Type | Delta Method | Content-Level Type |
|---|---|---|
| `web_page` | Content hash of text-extracted body | `web_page` |
| `pdf_endpoint` | Content hash of extracted text | `pdf_document` |
| `rss_feed` | Per-item GUID tracking | `rss_entry` |
| `json_api` | Content hash of normalized response | `json_api` |
| `regulatory_feed` | Document hash + filing ID | `regulatory_filing` |

---

## 2. Extraction Flow

**Owner:** `services/intel`
**Trigger:** `source.delta.detected` event via Pub/Sub (or manual `POST /internal/source-content-persisted` with the same JSON body for development).

**WS5 bridge (foundation):** Intel loads the `SourceContentPersistedEvent`, validates the archive manifest, downloads the raw object, optionally writes a normalized `.txt` under `normalized/` (GCS conventions), and updates BigQuery `source_contents.extraction_status` / `normalized_gcs_uri`. PDFs without text remain `awaiting_pdf_text_extraction` without a parser in this repo.

**WS5.1 (Epic 5.1):** A separate internal step, `POST /internal/extract-source-content` (when `SIGNAL_INTEL_EVENT_EXTRACTION_ENABLED` is on), reads normalized text (or the same GCS object as a fallback), runs **deterministic** keyword-family extractors, writes rows to BigQuery `extracted_events`, and patches `source_contents` to `extracted_ready`, `no_events_detected`, or `extraction_failed`. **No Signal promotion or scoring** in this step.

**WS5.2 (Epic 5.2):** Another internal step, `POST /internal/promote-source-content-signals` (when `SIGNAL_INTEL_SIGNAL_PROMOTION_ENABLED` is on), reads `extracted_events` for a `sourceContentId` from BigQuery, promotes rows that have **≥1 linked entity** into **Signals** (`signal_type` = `event_family`), computes **deterministic** scores (`scoring_version` = `deterministic_v1`), writes `signals`, `signal_score_history`, and `entity_signal_links`, projects to Firestore `workspaces/{workspaceId}/signalsLatest/{signalId}`, and sets `source_contents.extraction_status` to `promoted_ready` or `promotion_failed`. **No LLM**; **no cross-source merge** in this epic.

```
Pub/Sub: source.delta.detected
    │
    ▼
services/intel (Cloud Run)
    │
    ├── 1. Fetch raw content from GCS (gcsPath from event)
    │
    ├── 2. Parse content by contentSourceType
    │      web_page → structured text extraction
    │      pdf_document → text extraction + section detection
    │      rss_entry → entry parsing (title, body, date, links)
    │      json_api → schema-aware field extraction
    │      regulatory_filing → section and table extraction
    │
    ├── 3. Entity resolution
    │      Match parsed text against entity registry (Firestore entities collection):
    │        Precedence: externalId match → canonicalName → alias → fuzzy
    │        Output: list of (entityId, matchConfidence) pairs
    │        Confidence scale: 0–100
    │      No LLM at this stage. LLM escalation only if confidence < threshold.
    │
    ├── 4. Event extraction
    │      For each distinct business development found in the content:
    │        Classify into an eventFamily (see Event and Signal Taxonomy)
    │        Extract family-specific structured facts (extractedFacts)
    │        Assign extraction confidence (0–100)
    │        Assign eventTime with precision
    │        Produce one ExtractedEvent per distinct development
    │
    │      eventId = sha256(sourceContentIds.sorted().join(':')
    │                       + ':' + eventFamily
    │                       + ':' + entityIds.sorted().join(':'))
    │      Truncated to 32 hex chars.
    │
    ├── 5. Write ExtractedEvent(s)
    │      Firestore: extracted_events/{eventId} (7-day TTL, for dedup lookups)
    │      BigQuery: extracted_events table (permanent, partitioned by detectedAt)
    │
    ├── 6. Update SourceContent.extractionStatus
    │      'completed' if ≥1 event extracted
    │      'skipped' if content change was non-substantive
    │      'failed' if parsing error (log error, write to BigQuery processing_errors)
    │
    └── 7. For each ExtractedEvent, proceed to Signal Promotion
```

**Key rules:**
- One SourceContent → zero, one, or many ExtractedEvents.
- Events with `confidence < 30` are stored in BigQuery but do NOT proceed to Signal Promotion.
- Events with empty `entityIds` do NOT proceed to Signal Promotion (no unresolved signals).

---

## 3. Signal Promotion Flow

**Owner:** `services/intel` (inline, immediately after extraction)
**Input:** ExtractedEvents that pass quality gates (confidence ≥ 30, entityIds non-empty).

```
Qualifying ExtractedEvent
    │
    ├── 1. Deduplication check
    │      Compute candidate signalId = sha256(eventIds.sorted().join(':') + ':' + signalType)
    │      Truncated to 32 hex chars.
    │
    │      Check Firestore signals/{signalId}:
    │        Exists and active? → Mark as novelty: 'update', proceed to re-score
    │        Exists but dismissed/expired? → Mark as novelty: 'recurrence'
    │        Does not exist? → Mark as novelty: 'new'
    │
    │      Cross-source dedup (72h window):
    │        Check for active signals with same signalType + overlapping entityIds
    │        If found → supersede old signal, new one becomes active
    │
    ├── 2. Build Signal object
    │      signalType: derived from eventFamily (1:1 mapping for MVP)
    │      title: deterministically generated from extractedFacts (NOT LLM)
    │      body: structured description from extractedFacts + entity names
    │      entityIds: from event
    │      primaryEntityId: highest-confidence entity match
    │      eventIds: [eventId] (may be multiple if merged)
    │      sourceContentIds: transitive from events
    │      sourceUrls: from source content records
    │      signalTime: inherited from event eventTime
    │      status: 'active'
    │
    ├── 3. Score the signal (see Scoring Flow below)
    │
    ├── 4. Write Signal
    │      Firestore: signals/{signalId} — full document (read model, 90-day TTL)
    │      BigQuery: signals table — full row (permanent, partitioned by detectedAt)
    │
    ├── 5. Publish signal.scored to Pub/Sub
    │      Payload: signalId, compositeScore, entityIds, signalType, detectedAt
    │
    └── 6. Evaluate alert rules (see Alert Flow below)
```

---

## 4. Scoring Flow

**Owner:** `services/intel` (inline within Signal Promotion)
**Scale:** All dimensions and composite: integer 0–100.
**Dimensions:** 5.

```
Signal ready for scoring
    │
    ├── 1. Relevance (weight: 0.30)
    │      Based on entity role (competitor/client → high) and match confidence
    │
    ├── 2. Impact (weight: 0.25)
    │      Based on signalType (M&A = 95, project_award = 80, etc.)
    │      Modifiers: disclosed monetary value > threshold → +10, competitor → +5
    │
    ├── 3. Freshness (weight: 0.20)
    │      Based on hours since signalTime.value
    │      0–6h = 100, 6–24h = 85, 24–72h = 65, 72h–7d = 40, etc.
    │
    ├── 4. Confidence (weight: 0.15)
    │      From: entity match avg confidence (40%), extraction method (30%),
    │            corroboration count (15%), field completeness (15%)
    │
    ├── 5. Source Authority (weight: 0.10)
    │      From Source.sourceAuthority (admin-assigned 0–100)
    │      Multi-source signal: max authority among sources
    │
    └── compositeScore = round(
          relevance × 0.30 + impact × 0.25 + freshness × 0.20
          + confidence × 0.15 + sourceAuthority × 0.10
        )

    Weights are stored on Workspace document, configurable by admin.
    Must sum to 1.00.
```

**Enrichment escalation (optional, async):**
If a signal's confidence is below the enrichment threshold, it may be flagged for LLM enrichment. Enrichment does NOT block signal creation. The signal is written with its deterministic scores first; enrichment updates it asynchronously.

```
Signal flagged for enrichment
    │
    ├── Construct prompt with: raw content snippet, entity context, extraction attempt
    ├── Call LLM provider (provider-agnostic interface)
    ├── Parse structured response (validated against Zod schema)
    ├── Update signal in Firestore with enrichment results
    ├── Append enrichment record to BigQuery enrichments table
    └── Log cost attribution (tokens, provider, latency)
```

---

## 5. Serving / Read-Model Flow

**Owner:** `apps/api`
**Trigger:** HTTP requests from `apps/web`.

```
apps/web (browser)
    │
    ├── Firebase Auth token in Authorization header
    │
    ▼
apps/api (Fastify on Cloud Run)
    │
    ├── 1. Authenticate: verify Firebase Auth token
    │
    ├── 2. Route to handler
    │
    ├── 3. Read from appropriate store:
    │
    │    Operational endpoints (Firestore, low-latency):
    │      GET /signals             → signals collection (filtered, paginated)
    │      GET /signals/:id         → signals/{signalId}
    │      GET /signals/:id/provenance → eventIds → sourceContentIds → GCS paths
    │      GET /entities            → entities collection
    │      GET /entities/:id        → entities/{entityId}
    │      GET /briefs              → briefs collection
    │      GET /alerts/rules        → alert_rules collection
    │
    │    Analytics endpoints (BigQuery, higher latency, acceptable):
    │      GET /analytics/trends         → signal trend aggregation
    │      GET /analytics/source-health  → source fetch success rates
    │      GET /analytics/scoring-dist   → score distribution over time
    │
    │    Management endpoints (Firestore writes):
    │      POST/PUT/DELETE /alerts/rules → alert_rules CRUD
    │      PUT /users/me/preferences     → users/{userId}
    │      POST /sources                 → sources + trigger re-fetch
    │      POST /entities                → entities CRUD
    │
    └── 4. Return JSON response (schema from packages/contracts)
```

**Freshness recalculation at read time:**
The API recomputes the freshness dimension and currentCompositeScore from `signalTime` and the current clock. The stored `compositeScore` in Firestore reflects scoring at `scoredAt`. The API response includes both values.

**Read-model consistency:**
- Firestore read models are eventually consistent (seconds to low minutes from source change to dashboard).
- BigQuery has additional minutes of delay (streaming buffer flush).
- The dashboard does NOT require strong consistency.

---

## 6. Alert Flow

**Owner:** `services/intel` (rule evaluation) + Alert worker (delivery)
**Trigger:** Inline after signal scoring in services/intel.

```
Scored Signal
    │
    ├── 1. Load active alert rules from Firestore
    │      alert_rules/{ruleId}:
    │        entityIds, signalTypes, minScore (0–100), recipients, channel, active, cooldownMinutes
    │
    ├── 2. Evaluate signal against each active rule
    │      Match if:
    │        signal.entityIds ∩ rule.entityIds ≠ ∅  AND
    │        (rule.signalTypes is empty OR signal.signalType ∈ rule.signalTypes) AND
    │        signal.compositeScore ≥ rule.minScore
    │
    ├── 3. Dedup check: does alert_deliveries already have (ruleId, signalId)?
    │      Yes → skip (log as skipped_dedup)
    │
    ├── 4. Cooldown check: was last delivery for this ruleId within cooldownMinutes?
    │      Yes → skip (log as skipped_cooldown)
    │
    └── 5. Publish alert.triggered to Pub/Sub
           Payload: ruleId, signalId, signalTitle, compositeScore,
                    entityIds, recipients, channel, triggeredAt

Alert worker (Pub/Sub subscriber):
    │
    ├── Compose email body from signal data + rule context
    │   Include: signal title, score breakdown, entity names, source URLs, dashboard deep link
    ├── Send via Resend API
    ├── Write AlertDelivery to Firestore: alert_deliveries/{deliveryId}
    │     status: 'sent' | 'failed'
    └── On failure: dead-letter to alert.triggered.dlq
```

Alerts are downstream derivatives. They reference signals; they do not create or modify them.

---

## 7. Daily Brief Flow

**Owner:** Brief worker (Cloud Run Job)
**Trigger:** Cloud Scheduler, daily at configured time (default: 07:00 Europe/Rome).

```
Cloud Scheduler
    │
    ▼
Brief worker
    │
    ├── 1. Load brief configuration from Firestore
    │      Per-user preferences: entity scope, signalTypes, briefMinScore, timezone
    │
    ├── 2. Query Firestore signals collection
    │      Filter: detectedAt within coverage window (since last brief or last 24h)
    │      Filter: matching user's entity/type preferences
    │      Filter: compositeScore ≥ user's briefMinScore
    │      Sort: compositeScore descending
    │      Limit: top 20 (configurable)
    │
    ├── 3. Compose brief
    │      Default (deterministic): group by entity → by signalType, render structured summary
    │      Escalation (optional): LLM-generated executiveSummary paragraph
    │
    ├── 4. Build Brief object with BriefItem[] (point-in-time snapshots of signals)
    │
    ├── 5. Send via Resend (HTML email with dashboard deep links)
    │
    ├── 6. Write Brief to Firestore: briefs/{briefId}
    │      deliveryStatus: 'sent' | 'failed' | 'empty_skipped'
    │
    └── 7. On failure: log, do NOT retry (time-sensitive). Alert ops.
```

Briefs are downstream derivatives. BriefItems reference signals by ID and capture a score snapshot; they do not modify signals.

---

## 8. Function-Calling / Agent Flow

**Owner:** Agent orchestrator module within `apps/api`
**Trigger:** User request via `POST /agent/query`.

```
apps/web (agent UI)
    │
    ▼
apps/api: POST /agent/query
    │
    ├── 1. Authenticate user (Firebase Auth)
    │
    ├── 2. Build tool-calling context
    │      Available tools (Zod schemas in packages/contracts):
    │        query_signals(entityId?, signalType?, dateRange?, minScore?)
    │        get_entity_detail(entityId)
    │        get_signal_detail(signalId)
    │        get_signal_provenance(signalId) → events → source content → GCS
    │        get_source_status(sourceId)
    │        trigger_enrichment(signalId)
    │        get_brief_summary(dateRange?)
    │
    ├── 3. Send to LLM provider with function-calling schema
    │      Provider-agnostic interface: query + JSON Schema tool definitions
    │
    ├── 4. Execute tool calls → query Firestore/BigQuery, return structured JSON
    │
    ├── 5. Return tool results to LLM for synthesis
    │
    ├── 6. Return response to user (text + structured data + source citations)
    │
    └── 7. Log to Firestore: agent_executions/{executionId}
```

---

## 9. Failure, Retry, and Idempotency

### Principles

1. **Every pipeline stage is idempotent.** Deterministic IDs ensure reprocessing produces identical objects.
2. **Dedup keys are deterministic.** Derived from content hashes and sorted input arrays, not random UUIDs.
3. **At-least-once delivery.** Pub/Sub guarantees at-least-once. All consumers handle duplicates via deterministic ID upserts.

### Per-Stage Failure Handling

| Stage | Failure Mode | Handling | Retry Policy |
|---|---|---|---|
| Source fetch | HTTP error, timeout | Log, increment consecutiveFailures, publish `source.fetch.failed`, circuit breaker | Next scheduled run. No immediate retry. |
| GCS archive | Write failure | Exponential backoff (3 attempts). If all fail, skip downstream. | Max 3, then dead-letter. |
| Pub/Sub publish | Publish failure | SDK handles transient failures with built-in retry. | Built-in. |
| Extraction | Parse error | Log, write to BigQuery `processing_errors`, set extractionStatus = 'failed', ack message. | No retry — parsing errors are deterministic. Fix parser, replay from GCS. |
| Entity resolution | No match | Event created with empty entityIds. Does not proceed to signal promotion. | N/A. |
| Scoring | Rule error | Log, apply fallback compositeScore = 0, flag signal as `scoring_degraded`. | No retry — fix rule, re-score. |
| LLM enrichment | Provider timeout | Signal proceeds with deterministic scores. Enrichment retried independently. | 2 retries (5s/15s backoff), then give up. |
| Alert delivery | Resend API failure | Pub/Sub redelivery with backoff. After 5 failures → `alert.triggered.dlq`. | 5 attempts, then DLQ. |
| Brief delivery | Resend API failure | Log error, do NOT retry (time-sensitive). Alert ops. | No automatic retry. |

### Dead-Letter Topics

- `source.delta.detected.dlq`
- `signal.scored.dlq`
- `alert.triggered.dlq`

Dead-letter messages are logged to BigQuery `dead_letters` table, monitored via Cloud Monitoring, and manually replayable through an ops endpoint in `apps/api`.

### Replay and Reprocessing

Because raw content is immutable in GCS:
- Re-extract: re-publish `source.delta.detected` events → Intel re-extracts events from GCS content.
- Re-score: replay from BigQuery extracted_events → Intel re-promotes and re-scores signals.
- Replay events include a `replay: true` flag for log distinction.

### Consistency Model

| Store | Consistency | Notes |
|---|---|---|
| GCS | Strong (per-object, after write confirmation) | |
| Firestore | Strong (per-document, same region) | |
| BigQuery | Eventually consistent (minutes, streaming buffer) | Not used for real-time UI |
| Pub/Sub | At-least-once, no ordering guarantee | Pipeline does not require global ordering |

---

## Storage Role Summary

| Store | Writes From | Reads By | What Lives Here |
|---|---|---|---|
| **GCS** | `services/ingest` | `services/intel` (on extraction), ops (on audit) | Raw content bodies. Immutable. Provenance layer. |
| **Firestore** | `services/ingest` (source state, source_contents metadata), `services/intel` (extracted_events active window, signals read model), `apps/api` (config CRUD), alert worker, brief worker | `apps/api` (all dashboard/management reads), `services/intel` (entity registry, alert rules) | Operational state and read models. TTL-managed. |
| **BigQuery** | `services/ingest` (source_contents), `services/intel` (extracted_events, signals, enrichments, processing_errors), alert worker (alert_deliveries) | `apps/api` (analytics queries) | Historical/analytical layer. Permanent. Append-only. |

The frontend (`apps/web`) NEVER reads from any store directly. All reads go through `apps/api`.
