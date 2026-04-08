# Data Flow v1

> **⚠ SUPERSEDED** — This document has been replaced by [Data Flow v2](data-flow-v2.md), which aligns with the [Canonical Ontology](canonical-ontology.md) three-layer pipeline (SourceContent → ExtractedEvent → Signal), the 0–100 integer scoring scale, and the frozen MVP terminology. This file is retained for historical reference only. Do not use it as a source of truth.

This document describes the end-to-end data flows in Signal, from source ingestion through dashboard serving, alerts, daily briefs, and agent interactions.

---

## 1. Ingestion Flow

**Trigger:** Cloud Scheduler fires per-source on configured cadence (e.g., every 6h, daily, weekly depending on source type).

```
Cloud Scheduler
    │
    ▼
services/ingest (Cloud Run)
    │
    ├─── 1. Read source config from Firestore (URL, type, last_hash, schedule)
    │
    ├─── 2. Fetch source content (HTTP GET, API call, RSS pull)
    │        │
    │        ├── On fetch failure:
    │        │     ├── Increment failure counter in Firestore
    │        │     ├── Publish source.fetch.failed to Pub/Sub
    │        │     ├── Apply circuit breaker (back off after N consecutive failures)
    │        │     └── STOP (no further processing)
    │        │
    │        └── On success: continue
    │
    ├─── 3. Compute content hash (SHA-256 of normalized content)
    │
    ├─── 4. Compare hash with last_hash from Firestore
    │        │
    │        ├── Hash unchanged:
    │        │     ├── Update last_fetch_at in Firestore
    │        │     └── STOP (no delta, no downstream processing)
    │        │
    │        └── Hash changed: continue
    │
    ├─── 5. Archive raw content to GCS
    │        Path: gs://signal-archive/{source_type}/{source_id}/{YYYY-MM-DD}/{timestamp}.{ext}
    │        Metadata: content_hash, fetch_timestamp, source_url, content_type
    │
    ├─── 6. Update Firestore source state
    │        Set: last_hash, last_fetch_at, last_gcs_path, status = "delta_detected"
    │
    └─── 7. Publish source.delta.detected to Pub/Sub
             Payload:
               source_id: string
               source_type: string
               old_gcs_path: string | null (null on first fetch)
               new_gcs_path: string
               content_hash: string
               detected_at: ISO timestamp
               delta_type: "new" | "changed"
```

**Idempotency:** The content hash is the deduplication key. If the same content is fetched twice (e.g., retry after timeout), the hash comparison at step 4 prevents duplicate processing.

---

## 2. Delta Detection Flow

Delta detection is part of the ingestion flow (step 4 above). The granularity depends on source type:

| Source Type | Delta Method | Granularity |
|---|---|---|
| Web pages (HTML) | Content hash of text-extracted body | Full page |
| PDF documents | Content hash of extracted text | Full document |
| RSS/Atom feeds | Per-item GUID tracking | Per entry |
| JSON APIs | Content hash of normalized response | Per endpoint |
| Regulatory filings | Document hash + filing ID | Per filing |

For RSS feeds, `services/ingest` maintains a set of seen item GUIDs in the Firestore source document. Only new GUIDs generate delta events.

For structured APIs, the response is normalized (sorted keys, stable serialization) before hashing to avoid false positives from key ordering changes.

---

## 3. Normalization Flow

**Trigger:** `source.delta.detected` event consumed by `services/intel` via Pub/Sub subscription.

```
Pub/Sub: source.delta.detected
    │
    ▼
services/intel (Cloud Run)
    │
    ├─── 1. Fetch raw content from GCS (new_gcs_path from event)
    │        If old_gcs_path exists, fetch previous snapshot too
    │
    ├─── 2. Parse content by source_type
    │        HTML → structured text extraction (headings, paragraphs, tables, dates)
    │        PDF → text extraction + section detection
    │        RSS → entry parsing (title, body, date, links)
    │        JSON → schema-aware field extraction
    │
    ├─── 3. Entity resolution
    │        Match content against known entities in Firestore:
    │          competitors, clients, technologies, projects, commodities
    │        Output: list of matched entity IDs with confidence scores
    │
    ├─── 4. Signal extraction
    │        From parsed content + entity matches, produce one or more signals:
    │          signal_id: deterministic (hash of source_id + content_hash + entity_id)
    │          source_id, source_type
    │          entity_ids: matched entities
    │          signal_type: e.g., "competitor_financial_update", "technology_announcement",
    │                       "commodity_price_change", "regulatory_filing"
    │          title: extracted or generated summary (deterministic, NOT LLM)
    │          content_snapshot: key extracted text
    │          detected_at: timestamp
    │          source_url: original URL
    │          gcs_path: raw archive reference
    │
    └─── 5. Pass signals to scoring flow
```

**Entity Resolution Details:**
- Entities are maintained in Firestore (`entities/{entityId}`) with canonical names, aliases, and identifiers (e.g., stock tickers, company registration numbers).
- Matching uses exact match on identifiers, then fuzzy match on names/aliases.
- No LLM at this stage. LLM-assisted entity resolution is an escalation path for ambiguous matches.

---

## 4. Signal Scoring Flow

**Input:** Extracted signals from normalization (step 5 above). Runs inline within `services/intel`.

```
Normalized Signal
    │
    ├─── 1. Apply scoring rules (deterministic)
    │        Dimensions:
    │          relevance: how closely does this signal match tracked entities?
    │          impact: how significant is this event type for the business?
    │          freshness: how recent is the underlying source?
    │          source_authority: how authoritative is this source?
    │        Each dimension: 0.0 – 1.0
    │        Composite score: weighted combination (weights configurable per org)
    │
    ├─── 2. Confidence check
    │        If entity_match_confidence < threshold OR
    │           signal_type_confidence < threshold:
    │             ├── Flag for LLM enrichment (optional, async)
    │             └── Proceed with best-effort score (don't block on LLM)
    │
    ├─── 3. Write to Firestore read model
    │        Collection: signals/{signalId}
    │        Fields: all signal fields + composite_score + dimension_scores + scored_at
    │        TTL: signals older than 90 days archived (moved to BigQuery-only)
    │
    ├─── 4. Append to BigQuery
    │        Table: signals (partitioned by detected_at date)
    │        Contains: full signal payload + scores + processing metadata
    │
    ├─── 5. Publish signal.scored to Pub/Sub
    │        Payload: signal_id, composite_score, entity_ids, signal_type, detected_at
    │
    └─── 6. Evaluate alert rules (inline, see Alert Flow below)
```

**LLM Enrichment (Escalation Path):**
When triggered by low confidence or explicit configuration:

```
Signal flagged for enrichment
    │
    ├── Construct prompt with: raw content snippet, entity context, extraction attempt
    ├── Call LLM provider (provider-agnostic interface)
    │     Preferred: Perplexity for fact-grounded enrichment
    │     Fallback: configured alternative provider
    ├── Parse structured response (JSON, validated against Zod schema)
    ├── Update signal in Firestore with enrichment results
    ├── Append enrichment record to BigQuery (enrichments table)
    └── Log cost attribution (tokens used, provider, latency)
```

---

## 5. Serving / Read-Model Flow

**Trigger:** HTTP requests from `apps/web` to `apps/api`.

```
apps/web (browser)
    │
    ├── Firebase Auth token in Authorization header
    │
    ▼
apps/api (Fastify on Cloud Run)
    │
    ├─── 1. Authenticate: verify Firebase Auth token (Admin SDK)
    │
    ├─── 2. Route to handler
    │
    ├─── 3. Read from appropriate store:
    │
    │    Dashboard endpoints (low-latency):
    │      ├── GET /signals          → Firestore: signals collection (filtered, paginated)
    │      ├── GET /signals/:id      → Firestore: signals/{signalId}
    │      ├── GET /entities          → Firestore: entities collection
    │      ├── GET /entities/:id     → Firestore: entities/{entityId}
    │      ├── GET /briefs           → Firestore: briefs collection
    │      └── GET /alerts/rules     → Firestore: alert_rules collection
    │
    │    Analytics endpoints (higher-latency, acceptable):
    │      ├── GET /analytics/trends       → BigQuery: signal trend aggregation
    │      ├── GET /analytics/source-health → BigQuery: source fetch success rates
    │      └── GET /analytics/scoring-dist → BigQuery: score distribution over time
    │
    │    Management endpoints:
    │      ├── POST/PUT/DELETE /alerts/rules  → Firestore: alert_rules CRUD
    │      ├── PUT /users/me/preferences      → Firestore: users/{userId}
    │      ├── POST /sources                   → Firestore: sources + trigger re-fetch
    │      └── POST /entities                  → Firestore: entities CRUD
    │
    └─── 4. Return JSON response (schema from packages/contracts)
```

**Read Model Consistency:**
- Firestore read models are eventually consistent with the processing pipeline. The typical delay between source change detection and signal appearing in the dashboard is seconds to low minutes.
- The dashboard does NOT require strong consistency. Users understand that intelligence data has inherent latency.
- Analytics queries via BigQuery may have additional minutes of delay due to streaming buffer flush.

---

## 6. Alerts Flow

**Trigger:** Inline within `services/intel` after signal scoring (step 6 of scoring flow).

```
Scored signal
    │
    ├─── 1. Load active alert rules from Firestore
    │        alert_rules/{ruleId}:
    │          entity_ids: [entity IDs to watch]
    │          signal_types: [types to match]
    │          min_score: number (threshold)
    │          recipients: [user IDs or email addresses]
    │          channel: "email" | "webhook" (MVP: email only)
    │          active: boolean
    │
    ├─── 2. Evaluate signal against each active rule
    │        Match if:
    │          signal.entity_ids ∩ rule.entity_ids ≠ ∅  AND
    │          signal.signal_type ∈ rule.signal_types     AND
    │          signal.composite_score ≥ rule.min_score
    │
    ├─── 3. For each matched rule:
    │        Publish alert.triggered to Pub/Sub
    │        Payload:
    │          alert_rule_id, signal_id, signal_summary,
    │          recipients, channel, triggered_at
    │
    └─── 4. Alert worker (Pub/Sub subscriber):
              │
              ├── Compose email body from signal data + rule context
              ├── Send via Resend API
              ├── Write delivery record to Firestore: alert_deliveries/{deliveryId}
              │     status: "sent" | "failed"
              │     sent_at, recipient, signal_id, rule_id
              └── On failure: dead-letter to alert.triggered.dlq
```

**Deduplication:**
- Alert dedup key: `{rule_id}:{signal_id}`. If this combination already has a delivery record, skip.
- This prevents duplicate alerts on Pub/Sub retry.

---

## 7. Daily Brief Flow

**Trigger:** Cloud Scheduler, daily at configured time (default: 07:00 CET).

```
Cloud Scheduler
    │
    ▼
Brief worker (Cloud Run Job)
    │
    ├─── 1. Load brief configuration from Firestore
    │        Per-user brief preferences:
    │          entities of interest, signal types, score threshold,
    │          brief format (summary vs detailed), delivery email
    │
    ├─── 2. Query Firestore for qualifying signals
    │        Filter: detected_at within last 24h (or since last brief),
    │                matching user's entity/type preferences,
    │                composite_score ≥ user's threshold
    │        Sort: by composite_score descending
    │        Limit: top N signals (configurable, default 20)
    │
    ├─── 3. Compose brief content
    │        Default path (deterministic):
    │          Group signals by entity → by signal_type
    │          Render structured summary with signal titles, scores, source links
    │
    │        Escalation path (optional, per-org config):
    │          Send top signals to LLM for executive summary paragraph
    │          Validate response, include in brief header
    │
    ├─── 4. Send brief via Resend
    │        HTML email with structured layout
    │        Include deep links back to dashboard for each signal
    │
    ├─── 5. Archive brief to Firestore
    │        briefs/{briefId}:
    │          generated_at, recipient, signal_ids, content_snapshot
    │
    └─── 6. On failure: log error, do NOT retry automatically
             (briefs are time-sensitive; a late retry is worse than a skip)
             Alert ops team via monitoring
```

---

## 8. Function-Calling / Tool-Orchestration Flow

**Trigger:** User request via agent endpoint in `apps/api`.

```
apps/web (agent UI)
    │
    ├── User query: "What changed with [Competitor X] this week?"
    │
    ▼
apps/api: POST /agent/query
    │
    ├─── 1. Authenticate user (Firebase Auth)
    │
    ├─── 2. Build tool-calling context
    │        Available tools (defined as Zod schemas in packages/contracts):
    │          query_signals(entity_id?, signal_type?, date_range?, min_score?)
    │          get_entity_detail(entity_id)
    │          get_signal_detail(signal_id)
    │          get_source_status(source_id)
    │          search_signals(query_text, limit?)
    │          trigger_enrichment(signal_id)      // escalation to LLM
    │          get_brief_summary(date_range?)
    │
    ├─── 3. Send to LLM provider with function-calling schema
    │        Provider-agnostic interface:
    │          Input: user query + tool definitions (JSON Schema from Zod)
    │          Output: tool_calls[] or direct text response
    │
    ├─── 4. Execute tool calls
    │        Each tool call maps to an internal function that:
    │          - Queries Firestore/BigQuery through the same data layer as API endpoints
    │          - Returns structured JSON (validated against contract schemas)
    │          - Logs execution to Firestore: agent_executions/{executionId}
    │
    ├─── 5. Return tool results to LLM for synthesis
    │        LLM composes natural-language response from tool results
    │
    ├─── 6. Return response to user
    │        Include: text response + structured data references + source citations
    │
    └─── 7. Log full interaction
             agent_executions/{executionId}:
               user_id, query, tool_calls, results, response, latency, cost
```

**Provider Agnosticism:**
- The agent orchestrator accepts any LLM provider that supports function calling via JSON Schema.
- Tool definitions are generated from Zod schemas at build time.
- No provider-specific prompt engineering in the tool layer. Provider-specific adapters live in a thin adapter module.

**Future MCP Integration:**
- The tool registry is designed to be extensible. Each tool has a schema, an executor, and metadata.
- When MCP support is added, MCP-provided tools can be registered alongside internal tools using the same interface.
- The agent orchestrator does not need to know whether a tool is internal or MCP-provided.

---

## 9. Failure, Retry, and Idempotency

### General Principles

1. **Every pipeline stage is idempotent.** Processing the same event twice produces the same result without side effects.
2. **Deduplication keys are deterministic.** Computed from content hashes and source IDs, not random UUIDs.
3. **At-least-once is the delivery guarantee.** All consumers must handle duplicates gracefully.

### Per-Stage Failure Handling

| Stage | Failure Mode | Handling | Retry Policy |
|---|---|---|---|
| Source fetch | HTTP error, timeout, DNS failure | Log, increment failure counter, publish `source.fetch.failed`, apply circuit breaker | Cloud Scheduler retries on next scheduled run. No immediate retry. |
| GCS archive | Write failure | Retry with exponential backoff (3 attempts). If all fail, publish `source.fetch.failed`, skip downstream. | Max 3 retries, then dead-letter. |
| Pub/Sub publish | Publish failure | Retry with exponential backoff. Pub/Sub client handles transient failures automatically. | Built-in Pub/Sub retry. |
| Normalization | Parse error | Log with raw content reference. Write error record to BigQuery (`processing_errors` table). Ack the message (don't block the queue). | No retry — parsing errors are typically deterministic. Fix parser, replay from GCS. |
| Entity resolution | No match found | Proceed with empty entity list. Signal still created but scored lower on relevance. | N/A — not a failure. |
| Scoring | Rule evaluation error | Log, apply default fallback score (0.0), flag signal as `scoring_degraded`. | No retry — fix rule, re-score from BigQuery. |
| LLM enrichment | Provider timeout/error | Signal proceeds with deterministic-only scores. Enrichment can be retried independently. | 2 retries with 5s/15s backoff. Then give up and log. |
| Alert delivery | Resend API failure | Retry via Pub/Sub redelivery (exponential backoff). After 5 failures, dead-letter to `alert.triggered.dlq`. | Pub/Sub retry policy: 5 attempts, then DLQ. |
| Brief delivery | Resend API failure | Log error. Do NOT retry (time-sensitive). Alert ops. | No automatic retry. |

### Dead-Letter Handling

All Pub/Sub subscriptions have dead-letter topics:
- `source.delta.detected.dlq`
- `signal.scored.dlq`
- `alert.triggered.dlq`

Dead-letter messages are:
1. Logged with full context to BigQuery (`dead_letters` table)
2. Monitored via Cloud Monitoring alerts
3. Manually reviewable and replayable through an ops endpoint in `apps/api`

### Replay and Reprocessing

Because raw content is immutable in GCS:
- Any normalization/scoring stage can be replayed from GCS by re-publishing `source.delta.detected` events.
- Reprocessing is scoped: re-score a single signal, re-normalize a single source, or replay a full day.
- Replay events include a `replay: true` flag to distinguish from organic processing in logs.

### Consistency Model

- **GCS:** Strongly consistent for individual object reads after write confirmation.
- **Firestore:** Strongly consistent for document reads within the same region.
- **BigQuery:** Eventually consistent (streaming buffer has ~minutes delay). Not used for real-time UI.
- **Pub/Sub:** At-least-once delivery. Ordering not guaranteed across partitions; not required by the pipeline.

The pipeline does NOT require global ordering. Signals are independent events. If Signal A and Signal B from the same source arrive out of order, both are processed correctly because each carries its own content hash and timestamp.
