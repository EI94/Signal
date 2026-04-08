# services/ingest

Cloud Run–style worker: loads sources from Firestore, fetches URLs, updates operational fields.

## Config (environment)

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_PROJECT_ID` | yes | GCP project (Firestore) |
| `PORT` | no | Default `4001` |
| `SIGNAL_FETCH_TIMEOUT_MS` | no | Default `30000` |
| `SIGNAL_FETCH_MAX_BODY_BYTES` | no | Default `10485760` (10 MiB) |
| `SIGNAL_FETCH_USER_AGENT` | no | Default `Signal-ingest/<version> …` |
| `INGEST_RUN_ONCE_SECRET` | no | If set, required on `POST /internal/run-once` as `x-signal-ingest-secret` |
| `SIGNAL_INGEST_PERSISTENCE_ENABLED` | no | Default on; set `false` to skip GCS/BQ (hash-only Firestore updates for qualifying deltas). |
| `SIGNAL_GCS_RAW_BUCKET` | no | If unset: `<FIREBASE_PROJECT_ID>-signal-<env>-raw` where `env` is `dev` \| `staging` \| `prod` (from `@signal/config` / `parseServerRuntimeEnv`, aligned with Terraform `infra/terraform/README.md`). Override for non-standard bucket names. |
| `SIGNAL_BIGQUERY_DATASET` | no | Defaults to `signal_<env>_analytics`. |
| `SIGNAL_BIGQUERY_SOURCE_CONTENTS_TABLE` | no | Default `source_contents`. |
| `SIGNAL_DEFAULT_WORKSPACE_ID` | no | Optional `workspace_id` on BigQuery inserts. |
| `SIGNAL_PUBLISH_SOURCE_CONTENT_EVENTS_ENABLED` | no | Default `false`. Set `true` in GCP to publish `SourceContentPersistedEvent` after GCS + BigQuery. |
| `SIGNAL_PUBSUB_TOPIC_SOURCE_CONTENT_PERSISTED` | no | Default `source.delta.detected` (must match Terraform). |

Local ADC: `gcloud auth application-default login`. GCS/BQ require IAM roles on the ingest service account (see `infra/terraform/README.md`).

## Endpoints

- `GET /healthz`
- `POST /internal/run-once` — body optional `{ "sourceId": "<uuid>" }`

See [docs/architecture/fetch-pipeline-v1.md](../../docs/architecture/fetch-pipeline-v1.md).
