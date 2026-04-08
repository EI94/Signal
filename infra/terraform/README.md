# Signal — Terraform (Google Cloud)

Production-minded baseline for Signal on GCP: **Firestore** (operational), **BigQuery** (analytics), **GCS** (raw archive), **Pub/Sub** + **Cloud Tasks** + **Cloud Scheduler API** (async backbone), **Secret Manager** (reserved secrets), **Artifact Registry** (Cloud Run images). **No Cloud Run services** are deployed here yet (Epic 1.4+).

Single-tenant MVP, one GCP project per environment (`dev`, `staging`, `prod`).

---

## Directory layout

```
infra/terraform/
  README.md                 # This file
  .gitignore
  modules/
    project_services/       # API enablement
    service_accounts/       # Runtime identities (api, ingest, intel, scheduler)
    firestore/              # Default native Firestore DB (optional)
    storage/                # GCS raw archive bucket
    bigquery/               # Analytics dataset
    pubsub/                 # Topics + intel pull subscription
    tasks/                  # Cloud Tasks queues
    secrets/                # Empty Secret Manager secrets (optional)
    artifact_registry/      # Docker repository for Cloud Run
  environments/
    dev/                    # Entry point: dev project
    staging/
    prod/
```

Each environment directory is a **standalone Terraform root**: run `init` / `plan` / `apply` from `environments/<env>`.

---

## Naming conventions

| Pattern | Example | Notes |
|--------|---------|--------|
| Service account ID | `signal-<env>-api` | Lowercase, hyphens; max 30 chars. |
| GCS raw bucket | `<project_id>-signal-<env>-raw` | Globally unique; project prefix avoids collisions. |
| BigQuery dataset | `signal_<env>_analytics` | Underscores (BQ constraint). |
| Pub/Sub topics | `source.delta.detected`, `signal.scored`, `alert.triggered` | Align with [data-flow-v2](../../docs/architecture/data-flow-v2.md). |
| Pull subscription | `signal-<env>-intel-source-delta-pull` | Intel consumes `source.delta.detected`. |
| Cloud Tasks queues | `signal-<env>-ingest`, `signal-<env>-intel` | Same region as future Cloud Run. |
| Artifact Registry | `signal-<env>-containers` | Docker format. |
| Secret IDs | `signal-<env>-perplexity-api-key`, `signal-<env>-resend-api-key` | Empty secrets; versions added later. |

Common **labels** on supported resources: `app=signal`, `environment=<env>`, `managed_by=terraform`.

---

## What gets enabled (APIs)

`google_project_service` enables at least:

| API | Why |
|-----|-----|
| `serviceusage.googleapis.com` | Service Usage / API enablement |
| `iam.googleapis.com` | IAM bindings |
| `run.googleapis.com` | Future Cloud Run |
| `firestore.googleapis.com` | Firestore |
| `bigquery.googleapis.com` | BigQuery |
| `storage.googleapis.com` | GCS |
| `pubsub.googleapis.com` | Pub/Sub |
| `cloudtasks.googleapis.com` | Cloud Tasks |
| `cloudscheduler.googleapis.com` | Scheduler (jobs not created yet) |
| `secretmanager.googleapis.com` | Secrets (if module enabled) |
| `artifactregistry.googleapis.com` | Container images |

---

## IAM (minimal)

| Principal | Role | Resource |
|-----------|------|----------|
| `signal-<env>-api` | `roles/datastore.user` | Project (Firestore access for `apps/api`) |
| `signal-<env>-api` | `roles/bigquery.dataViewer` | Dataset `signal_<env>_analytics` |
| `signal-<env>-ingest` | `roles/storage.objectAdmin` | Raw archive bucket |
| `signal-<env>-ingest` | `roles/bigquery.dataEditor` | Dataset (future pipeline writes) |
| `signal-<env>-ingest` | `roles/pubsub.publisher` | Topic `source.delta.detected` |
| `signal-<env>-intel` | `roles/storage.objectViewer` | Raw archive bucket |
| `signal-<env>-intel` | `roles/bigquery.dataEditor` | Dataset |
| `signal-<env>-intel` | `roles/pubsub.publisher` | Topics `signal.scored`, `alert.triggered` |
| `signal-<env>-intel` | `roles/pubsub.subscriber` | Subscription `signal-<env>-intel-source-delta-pull` (if created) |
| `signal-<env>-intel` | `roles/secretmanager.secretAccessor` | Secret `signal-<env>-perplexity-api-key` (if secrets exist) |
| `signal-<env>-api` | `roles/secretmanager.secretAccessor` | Secret `signal-<env>-resend-api-key` (if secrets exist) |

`signal-<env>-scheduler` is created for future **Cloud Scheduler → Cloud Run** OIDC invocation; no `run.invoker` grant until services exist.

No project-wide Owner/Editor. Tighten further as workloads land.

---

## Firestore (honest handling)

- This stack uses `google_firestore_database` with `name = "(default)"` and `type = "FIRESTORE_NATIVE"` when `manage_firestore_database = true`.
- **Location** is set via `firestore_location_id` (e.g. `europe-west1` or multi-region `eur3`). **Pick once per project**; changing location later is not trivial.
- If the **default database already exists** (e.g. created in console or another tool), `apply` may fail. Then either:
  - Set `manage_firestore_database = false` and **import** the existing DB:  
    `terraform import module.firestore.google_firestore_database.default[0] projects/<PROJECT_ID>/databases/(default)`  
    (adjust module path if needed), or
  - Create the DB manually and import, or skip Terraform management until aligned with the team.
- **Datastore mode** legacy DBs are incompatible with native Firestore in the same project; migration is a separate project-level decision (not automated here).

Terraform **cannot** set `lifecycle.prevent_destroy` from a variable on all versions; **protect production** operationally (backups, change review, optional `prevent_destroy` in code with a literal `true` if your policy requires it).

---

## Cloud Scheduler

The **API is enabled** so jobs can be added later. **No `google_cloud_scheduler_job` resources** are created: real jobs need stable Cloud Run URLs and auth. Add jobs in a follow-up epic when targets exist.

---

## Storage lifecycle

- Raw bucket: **versioning** on by default (provenance / recovery trade-off).
- Optional **object age delete** via `raw_archive_lifecycle_age_days` (default `null` = no delete rule).

**Archive path conventions** (object keys inside the bucket) are **not** defined in Terraform; they live in-repo for ingestion — see [GCS source archive v1](../../docs/architecture/gcs-source-archive-v1.md) and [infra/gcs/README.md](../../infra/gcs/README.md).

---

## BigQuery: dataset vs tables

Terraform creates the **analytics dataset** (`signal_<env>_analytics`) and IAM bindings. **Table DDL is not applied here** (see [infra/bigquery/README.md](../bigquery/README.md) and [BigQuery analytical schema v1](../../docs/architecture/bigquery-analytical-schema-v1.md)): versioned `CREATE TABLE` scripts and JSON field schemas live in-repo for review; apply them when ingestion (WS4+) is ready.

---

## Remote state (recommended)

Default is **local** `terraform.tfstate` (ignored by git). For teams, use a **GCS backend** (separate bootstrap bucket or shared tooling bucket):

```hcl
terraform {
  backend "gcs" {
    bucket = "YOUR_TF_STATE_BUCKET"
    prefix = "signal/dev"
  }
}
```

Do **not** commit bucket names or credentials. Bootstrap the state bucket once (Console or minimal Terraform). Staging/prod use different `prefix` or buckets.

---

## Operator variables

Copy `environments/<env>/terraform.tfvars.example` → `terraform.tfvars` (gitignored). Required:

| Variable | Description |
|----------|-------------|
| `project_id` | Target GCP project ID |

Optional variables are documented in `environments/<env>/variables.tf` (region, BigQuery location, Firestore location, flags for secrets, Artifact Registry, subscription, etc.).

**Authentication:** `gcloud auth application-default login` or a CI service account with appropriate IAM for Terraform (not configured in this epic).

---

## Commands (dev example)

From repository root:

```bash
cd infra/terraform/environments/dev
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — set project_id

terraform init -backend=false   # or: terraform init  if using remote backend
terraform fmt -check -recursive ../../
terraform validate
terraform plan -var-file=terraform.tfvars
# terraform apply -var-file=terraform.tfvars
```

Repeat for `staging` and `prod` with the correct project and tfvars.

---

## Intended follow-ups (not this epic)

- Cloud Run services + `roles/run.invoker` for scheduler SA
- Push subscriptions / DLQs as workers are implemented
- Cloud Scheduler jobs with real OIDC to Cloud Run
- Terraform CI (plan on PR) and remote state in GCS
- Tighten IAM (custom roles, per-bucket prefixes) as code paths stabilize
