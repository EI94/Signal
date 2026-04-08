# services/intel

Downstream intake after **SourceContent** persistence: load `source_content.persisted` handoff events, read manifest + raw bytes from GCS, optional normalized `.txt` under `normalized/`, update BigQuery `source_contents` extraction fields. Optional **deterministic extraction** (WS5.1) writes `extracted_events`. Optional **Signal promotion** (WS5.2) reads those rows and writes analytical Signals + a small Firestore `signalsLatest` projection — **no LLM**.

## Config

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_PROJECT_ID` | yes | GCP project (GCS + BigQuery) |
| `PORT` | no | Default `4002` |
| `SIGNAL_GCS_RAW_BUCKET` | no | Defaults to Terraform-style `<project>-signal-<env>-raw` |
| `SIGNAL_BIGQUERY_DATASET` | no | Default `signal_<env>_analytics` |
| `SIGNAL_BIGQUERY_SOURCE_CONTENTS_TABLE` | no | Default `source_contents` |
| `SIGNAL_BIGQUERY_EXTRACTED_EVENTS_TABLE` | no | Default `extracted_events` |
| `SIGNAL_INTEL_NORMALIZED_WRITES_ENABLED` | no | Default on; set `false` to skip normalized `.txt` uploads (still updates BQ to `normalization_skipped`) |
| `SIGNAL_INTEL_EVENT_EXTRACTION_ENABLED` | no | Default off; set `true` to allow `POST /internal/extract-source-content` to run extractors and write BigQuery |
| `SIGNAL_INTEL_EXTRACTION_MAX_TEXT_CHARS` | no | Cap on normalized text length for extraction (default `500000`) |
| `SIGNAL_INTEL_SIGNAL_PROMOTION_ENABLED` | no | Default off; set `true` for `POST /internal/promote-source-content-signals` |
| `SIGNAL_BIGQUERY_SIGNALS_TABLE` | no | Default `signals` |
| `SIGNAL_BIGQUERY_SIGNAL_SCORE_HISTORY_TABLE` | no | Default `signal_score_history` |
| `SIGNAL_BIGQUERY_ENTITY_SIGNAL_LINKS_TABLE` | no | Default `entity_signal_links` |
| `SIGNAL_DEFAULT_WORKSPACE_ID` | no | Required for promotion (or pass `workspaceId` in body) — Firestore + BQ `workspace_id` |
| `INTEL_INTERNAL_SECRET` | no | If set, required on internal POST routes as `x-signal-intel-secret` |
| `SIGNAL_TOOL_INGEST_BASE_URL` | no | Base URL for internal tool `fetch_source` (HTTP to ingest `POST /internal/run-once`) |
| `SIGNAL_TOOL_INGEST_RUN_ONCE_SECRET` | no | Optional `x-signal-ingest-secret` when calling ingest run-once |
| `SIGNAL_PERPLEXITY_ENABLED` | no | Default off; set `true` with `SIGNAL_PERPLEXITY_API_KEY` to enable `summarize_delta` enrichment |
| `SIGNAL_PERPLEXITY_API_KEY` | if enabled | Required when Perplexity is enabled |
| `SIGNAL_PERPLEXITY_BASE_URL` | no | Default `https://api.perplexity.ai` |
| `SIGNAL_PERPLEXITY_MODEL` | no | Default `sonar` |
| `SIGNAL_PERPLEXITY_TIMEOUT_MS` | no | Default `45000` |

## Endpoints

- `GET /healthz`
- `POST /internal/source-content-persisted` — JSON body: `SourceContentPersistedEvent` (`@signal/contracts`)
- `POST /internal/extract-source-content` — JSON body: `ExtractSourceContentRequest` (`@signal/contracts`); requires `SIGNAL_INTEL_EVENT_EXTRACTION_ENABLED=true`
- `POST /internal/promote-source-content-signals` — JSON body: `PromoteSourceContentSignalsRequest` (`@signal/contracts`); requires `SIGNAL_INTEL_SIGNAL_PROMOTION_ENABLED=true` and a workspace id (env or body)
- `POST /internal/tools/execute` — JSON body: `SignalToolExecutionRequest` (`@signal/contracts`); wraps the internal tool registry (see [agent-orchestrator-v1.md](../../docs/architecture/agent-orchestrator-v1.md)); same `x-signal-intel-secret` rule when `INTEL_INTERNAL_SECRET` is set

See [docs/architecture/data-flow-v2.md](../../docs/architecture/data-flow-v2.md).
