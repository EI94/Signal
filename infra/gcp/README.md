# GCP env templates (staging)

YAML files here are **non-secret** environment defaults for **signal-ac219** staging (`infra/gcp/staging-signal-*.yaml`). Use them to stay aligned with Cloud Run when updating env vars; **secrets** (API keys, `INTEL_INTERNAL_SECRET`, etc.) are injected at deploy from Secret Manager and are **not** committed.

| File | Service |
|------|---------|
| `staging-signal-api-env.yaml` | `signal-api` — includes `SIGNAL_PUBLIC_WORKSPACE_ID` for anonymous read |
| `staging-signal-ingest-env.yaml` | `signal-ingest` |
| `staging-signal-intel-env.yaml` | `signal-intel` — Perplexity flags; `SIGNAL_PERPLEXITY_API_KEY` comes from the secret at runtime |

**Drift check:** after changing Cloud Run, compare with `gcloud run services describe <service> --region=europe-west12 --project=signal-ac219`. Runtime **service account** names on Cloud Run may differ from Terraform’s `signal-<env>-intel` pattern; Secret Manager IAM must target the **actual** Cloud Run execution identity.
