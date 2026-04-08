# Orchestration v1 (ingest → intel backbone)

> **WS4.4** — Explicit boundaries for scheduled triggers, Pub/Sub handoff, idempotency keys, and retry/DLQ posture. **No** workflow engine; contracts + small helpers only. Aligns with [Data flow v2](data-flow-v2.md) and [Fetch pipeline v1](fetch-pipeline-v1.md).

---

## 1. Steps (logical)

| Step | Entry | Payload / contract |
|------|--------|-------------------|
| Scheduled ingest | `POST /internal/run-once` (e.g. Cloud Scheduler → Cloud Run) | `IngestInternalRunOnceBodyV1` — optional `sourceId`, `correlationId`, `idempotencyKey`, `scheduledAt` |
| Persisted handoff (Pub/Sub) | Topic `source.delta.detected` (Terraform) | `PipelineHandoffEnvelopeV1` when `SIGNAL_PIPELINE_HANDOFF_ENVELOPE_ENABLED` is true (default), else bare `SourceContentPersistedEvent` |
| Intel intake | `POST /internal/source-content-persisted` | Parses **either** envelope or bare event via `parseSourceContentPersistedForIntel` |
| Extraction / promotion | existing internal routes | Optional `orchestration` on body (`OrchestrationContextV1`) for tracing |

Domain idempotency (BQ/GCS/Firestore writers) is unchanged: deterministic IDs and delete-before-insert where already implemented.

---

## 2. Idempotency keys

- **Handoff publish:** `buildSourceContentHandoffIdempotencyKey(sourceContentId)` — 32-hex, stable per SourceContent.
- **Scheduled run (observability):** `buildScheduledIngestRunIdempotencyKey({ scope, sourceId?, windowStartIso })` — caller must pass a stable `windowStartIso` (e.g. scheduler fire time).
- Generic: `buildOrchestrationIdempotencyKey(segments)`.

Keys are for **dedupe logging and subscriber hints**; they do not replace storage-level keys.

---

## 3. Retry and dead-letter (baseline)

**Not exactly-once.** Pub/Sub may deliver more than once; HTTP handlers must remain safe to retry (same as today).

Recommended posture when a **push subscription** invokes intel (future):

| Concern | Baseline |
|---------|----------|
| Retries | Transient failures → allow Pub/Sub redelivery with backoff; avoid infinite poison loops. |
| DLQ | Attach a dead-letter topic or subscription to capture messages that exceed `maxDeliveryAttempts` after non-ack. Operators inspect DLQ, fix cause, replay manually. |
| Ack/nack | Return **non-2xx** or **nack** so Pub/Sub retries; return **2xx** only after durable side effects are committed (or are safe to repeat). |

Full Terraform wiring for DLQ is optional in this epic; the table above is the **contract** for future infra.

---

## 4. Local development

Manual `curl` to ingest `run-once` and intel routes remains supported. Intel accepts **unwrapped** `SourceContentPersistedEvent` JSON without envelope fields.

---

## 5. Environment (ingest)

| Variable | Default | Purpose |
|--------|---------|---------|
| `SIGNAL_PIPELINE_HANDOFF_ENVELOPE_ENABLED` | `true` (if unset) | Wrap Pub/Sub JSON in `PipelineHandoffEnvelopeV1` |

Set to `false` to publish legacy bare events (e.g. temporary compatibility).
