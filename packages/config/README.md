# @signal/config

Shared **runtime configuration** for Node services (`apps/api`, `services/*`). Validated with **Zod**, fail-fast on bad ports / log levels, immutable config objects after load.

## Server loaders (Node only)

| Function | Default port | `serviceName` |
|----------|--------------|-----------------|
| `loadApiRuntimeConfig()` | 4000 | `api` |
| `loadIngestRuntimeConfig()` | 4001 | `ingest` |
| `loadIntelRuntimeConfig()` | 4002 | `intel` (needs `FIREBASE_PROJECT_ID`; GCS/BQ defaults match Terraform) |

Each accepts an optional `NodeJS.ProcessEnv` (defaults to `process.env`) for tests.

**Do not import these loaders from browser code.** They read full `process.env`. The web app uses only `NEXT_PUBLIC_*` via Next.js (see `apps/web/.env.example`).

## Environment variables (process / `.env`)

### Shared (all Node services)

| Variable | Required | Default | Notes |
|----------|----------|---------|--------|
| `NODE_ENV` | No | `development` | Unknown values are treated as `development`. |
| `PORT` | No | per service (4000–4002) | Integer 1–65535. |
| `LOG_LEVEL` | No | `info` | Pino levels: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`. |
| `SIGNAL_SERVICE_VERSION` | No | see below | Overrides version for health payloads. |
| `npm_package_version` | No | — | Set by npm/pnpm when running a package script; used if `SIGNAL_SERVICE_VERSION` unset. |

### apps/api only (`loadApiRuntimeConfig`)

| Variable | Required | Default | Notes |
|----------|----------|---------|--------|
| `FIREBASE_PROJECT_ID` | **Yes** | — | Firebase / GCP project ID for Admin SDK. |
| `SIGNAL_DEFAULT_WORKSPACE_ID` | **Yes** | — | Firestore `workspaces/{id}` used when `X-Signal-Workspace-Id` is absent (single-tenant MVP). |
| `SIGNAL_PUBLIC_WORKSPACE_ID` | No | same as `SIGNAL_DEFAULT_WORKSPACE_ID` | Anonymous read-only serving resolves to this workspace when no `Authorization` bearer is present. |
| `CORS_ORIGINS` | No | `http://localhost:3000` | Comma-separated allowed browser origins. |
| `SIGNAL_BIGQUERY_DATASET` | No | — | When set, `apps/api` may query BigQuery (e.g. entity timeline from `entity_signal_links`). |
| `SIGNAL_BIGQUERY_ENTITY_SIGNAL_LINKS_TABLE` | No | `entity_signal_links` | Table id within the analytics dataset. |

### services/ingest only (`loadIngestRuntimeConfig`)

| Variable | Required | Default | Notes |
|----------|----------|---------|--------|
| `FIREBASE_PROJECT_ID` | **Yes** | — | Firestore source registry (`sources`). |
| `SIGNAL_FETCH_TIMEOUT_MS` | No | `30000` | HTTP GET timeout (ms). |
| `SIGNAL_FETCH_MAX_BODY_BYTES` | No | `10485760` | Max response body size (10 MiB). |
| `SIGNAL_FETCH_USER_AGENT` | No | `Signal-ingest/<version> …` | Outbound `User-Agent`. |
| `INGEST_RUN_ONCE_SECRET` | No | — | If set, `POST /internal/run-once` requires header `x-signal-ingest-secret`. |
| `SIGNAL_INGEST_PERSISTENCE_ENABLED` | No | `true` | Set `false`/`0`/`no` to disable GCS + BigQuery (qualifying deltas only update Firestore hash). |
| `SIGNAL_GCS_RAW_BUCKET` | No | `defaultGcsRawBucketName(projectId, env)` | Raw archive bucket. If unset, derived as `<FIREBASE_PROJECT_ID>-signal-<env>-raw` with `env` ∈ { `dev`, `staging`, `prod` } from runtime environment — same rule as `infra/terraform/README.md`. Programmatic helper: `defaultGcsRawBucketName()` from this package. |
| `SIGNAL_BIGQUERY_DATASET` | No | `signal_<env>_analytics` | Analytics dataset id. |
| `SIGNAL_BIGQUERY_SOURCE_CONTENTS_TABLE` | No | `source_contents` | Target table for SourceContent rows. |
| `SIGNAL_DEFAULT_WORKSPACE_ID` | No | — | Optional `workspace_id` column for BigQuery inserts. |
| `SIGNAL_PUBLISH_SOURCE_CONTENT_EVENTS_ENABLED` | No | `false` | When `true`/`1`/`yes`, ingest publishes `SourceContentPersistedEvent` after successful GCS + BQ. |
| `SIGNAL_PUBSUB_TOPIC_SOURCE_CONTENT_PERSISTED` | No | `source.delta.detected` | Pub/Sub topic id (Terraform); JSON body is `PipelineHandoffEnvelopeV1` by default or bare `SourceContentPersistedEvent` if `SIGNAL_PIPELINE_HANDOFF_ENVELOPE_ENABLED=false`. |
| `SIGNAL_PIPELINE_HANDOFF_ENVELOPE_ENABLED` | No | `true` (when unset) | Wrap Pub/Sub publish in `PipelineHandoffEnvelopeV1` for structured handoff. |

Version resolution: **`SIGNAL_SERVICE_VERSION` → `npm_package_version` → `0.0.0`**.

## Public vs private (frontend)

- **Server-only:** everything above, and any future API keys, DB settings, etc. Stay in `apps/api` and `services/*` only.
- **Browser:** only variables prefixed with **`NEXT_PUBLIC_`** may be referenced from client components (Next.js inlines them at build time). Documented in [`apps/web/.env.example`](../../apps/web/.env.example) (`NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_SIGNAL_API_BASE_URL`). Never put secrets in that prefix.

`@signal/config` does not export client-safe env helpers until there is a real need (avoids pulling Node types into the bundle).

## Secrets naming (aligned with Terraform)

Terraform creates Secret Manager IDs (see `infra/terraform/modules/secrets/`):

| Secret ID pattern | Consumer |
|-------------------|----------|
| `signal-<env>-perplexity-api-key` | Intel — `SIGNAL_PERPLEXITY_API_KEY` when Perplexity is enabled (e.g. staging `summarize_delta`) |
| `signal-<env>-resend-api-key` | API / email (optional; unused until Resend is enabled) |

**Cloud Run** typically injects these as **environment variables** at deploy time (values resolved from Secret Manager outside the app). This codebase stays **agnostic**: read `process.env` only; no Secret Manager client in the platform foundation.

Local development uses **`.env`** files (see repo `.env.example` files); never commit secrets.

## API surface

- `loadApiRuntimeConfig`, `loadIngestRuntimeConfig`, `loadIntelRuntimeConfig`
- `defaultGcsRawBucketName`, `terraformEnvShortForSignal` — deterministic GCS raw bucket naming (Terraform-aligned); used by `loadIngestRuntimeConfig`
- `parseServerRuntimeEnv` — lower-level helper for custom tests
- `parseRuntimeEnvName` — NODE_ENV → `development` | `staging` | `production`
- Types: `ApiRuntimeConfig`, `ServerRuntimeConfig`, `RuntimeEnvName`, `LogLevel`, etc.

`ApiRuntimeConfig` additionally includes `firebaseProjectId`, `corsOrigins`, and `defaultWorkspaceId` (from `SIGNAL_DEFAULT_WORKSPACE_ID`).

### services/intel only (`loadIntelRuntimeConfig`)

| Variable | Required | Default | Notes |
|----------|----------|---------|--------|
| `FIREBASE_PROJECT_ID` | **Yes** | — | GCP project for Storage + BigQuery clients. |
| `SIGNAL_GCS_RAW_BUCKET` | No | `<project>-signal-<env>-raw` | Same raw archive bucket as ingest. |
| `SIGNAL_BIGQUERY_DATASET` | No | `signal_<env>_analytics` | |
| `SIGNAL_BIGQUERY_SOURCE_CONTENTS_TABLE` | No | `source_contents` | |
| `SIGNAL_BIGQUERY_EXTRACTED_EVENTS_TABLE` | No | `extracted_events` | Target table for deterministic `ExtractedEvent` rows. |
| `SIGNAL_INTEL_NORMALIZED_WRITES_ENABLED` | No | `true` | Set `false` to skip writing normalized `.txt` locally. |
| `SIGNAL_INTEL_EVENT_EXTRACTION_ENABLED` | No | `false` | When `true`, `POST /internal/extract-source-content` runs extractors. |
| `SIGNAL_INTEL_EXTRACTION_MAX_TEXT_CHARS` | No | `500000` | Max normalized text characters passed to extractors. |
| `SIGNAL_INTEL_SIGNAL_PROMOTION_ENABLED` | No | `false` | When `true`, `POST /internal/promote-source-content-signals` runs deterministic promotion. |
| `SIGNAL_BIGQUERY_SIGNALS_TABLE` | No | `signals` | Analytical signals table. |
| `SIGNAL_BIGQUERY_SIGNAL_SCORE_HISTORY_TABLE` | No | `signal_score_history` | Score dimension snapshots. |
| `SIGNAL_BIGQUERY_ENTITY_SIGNAL_LINKS_TABLE` | No | `entity_signal_links` | Entity–signal bridge. |
| `SIGNAL_DEFAULT_WORKSPACE_ID` | No | — | Workspace for Firestore `signalsLatest` and BQ `workspace_id` when promoting. |
| `SIGNAL_TOOL_INGEST_BASE_URL` | No | — | Base URL for internal tool `fetch_source` (`POST …/internal/run-once` on ingest). |
| `SIGNAL_TOOL_INGEST_RUN_ONCE_SECRET` | No | — | Optional `x-signal-ingest-secret` when ingest protects run-once. |
| `SIGNAL_PERPLEXITY_ENABLED` | No | `false` | When `true`, `SIGNAL_PERPLEXITY_API_KEY` is required; enables optional tool `summarize_delta`. |
| `SIGNAL_PERPLEXITY_API_KEY` | If enabled | — | Server-only; never client-exposed. |
| `SIGNAL_PERPLEXITY_BASE_URL` | No | `https://api.perplexity.ai` | |
| `SIGNAL_PERPLEXITY_MODEL` | No | `sonar` | |
| `SIGNAL_PERPLEXITY_TIMEOUT_MS` | No | `45000` | HTTP timeout for Perplexity calls. |
| `INTEL_INTERNAL_SECRET` | No | — | If set, internal intel POST routes require `x-signal-intel-secret`. |
