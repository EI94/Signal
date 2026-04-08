# Usage metering v1 (WS10.1)

Small **append-only** usage layer so Signal can answer operational questions (sources fetched, content persisted, events extracted, signals promoted, alerts evaluated, briefs generated, provider/email calls) without building a full observability product.

## Persistence

- **Store:** BigQuery analytical dataset (`signal_<env>_analytics`), table **`usage_events`**.
- **DDL:** `infra/bigquery/ddl/mvp_v1.sql`
- **Contracts:** `packages/contracts/src/usage-metering.ts` — wire shape for one row (`UsageMeteringRowSchema`).

Rows are written with **streaming insert** and **`insertId` = `usage_event_id`** so BigQuery can dedupe retries of the same logical event (not exactly-once semantics across separate runs).

## Runtime configuration

| Variable | Default | Role |
|----------|---------|------|
| `SIGNAL_USAGE_METERING_ENABLED` | off | Must be `true` / `1` / `yes` to insert rows. |
| `SIGNAL_BIGQUERY_USAGE_EVENTS_TABLE` | `usage_events` | Table id within `SIGNAL_BIGQUERY_DATASET`. |

Set on **`services/ingest`** and **`services/intel`** as needed. When disabled, pipeline behavior is unchanged; no BigQuery calls are made for metering.

## Event types (low cardinality)

| `event_type` | Emitted from |
|----------------|--------------|
| `ingest.run.complete` | End of `POST /internal/run-once` (`IngestRunOnceSummary` in `metadata_json.summary`). |
| `intel.normalization.complete` | After successful `processSourceContentPersisted`. |
| `intel.extract.complete` | After extract route (ok / skipped / failure). |
| `intel.promote.complete` | After promote route (ok / skipped / failure). |
| `intel.alerts.evaluate.complete` | After alert evaluation for one signal (`firedCount` in metadata). |
| `intel.brief.generate.complete` | After successful morning brief generation. |
| `intel.provider.perplexity` | Each `callPerplexitySummarizeDelta` completion (outcome + duration in metadata). |
| `intel.email.send` | After internal send-brief / send-alert responses. |
| `intel.tool.execute` | `POST /internal/tools/execute` (`onExecutionFinish` on orchestrator; duration in `quantity` when `unit` = `ms`). |

## Idempotency / retries

- **`usage_event_id`:** SHA-256 (hex, 32 chars) over `service|eventType|occurredAtIso|dedupeKey`.
- **Retries:** Re-sending the same logical operation may produce **another** row if `dedupeKey` differs (e.g. new timestamp bucket). That is intentional: metering is **honest** about activity, not a strict ledger.

## Not measured (v1)

- Per-source registry row churn beyond ingest run aggregates.
- Fine-grained BigQuery bytes scanned / slot time.
- User-level billing dimensions.

Hardening for aggregation, SLOs, and dashboards is **WS10.2+**; this epic only establishes the foundation.
