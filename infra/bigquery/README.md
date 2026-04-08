# BigQuery — analytical schema artifacts (WS3.2)

This directory holds **versioned, reviewable** definitions for the Signal **analytics** dataset. It complements Terraform, which provisions the **dataset shell + IAM** only (`infra/terraform/modules/bigquery`).

## What Terraform does / does not do

| Terraform | Repo artifacts (here) |
|-----------|------------------------|
| Creates `signal_<env>_analytics` | Table DDL, field JSON, documentation |
| Dataset location, labels | Partitioning / clustering choices |
| IAM (ingest/intel editor, api viewer) | Column semantics and evolution rules |

**Why tables are not in Terraform (v1):** table schemas will evolve quickly during WS4 ingestion; managing wide `google_bigquery_table` resources in Terraform adds churn without a mature release process. Tables are created from **`ddl/mvp_v1.sql`** (or per-environment CI) when you are ready to materialize them. This is documented honestly in `docs/architecture/bigquery-analytical-schema-v1.md`.

## Layout

| Path | Purpose |
|------|---------|
| `ddl/mvp_v1.sql` | `CREATE TABLE` statements with `PARTITION BY` / `CLUSTER BY`. Replace ``PROJECT_ID`` and ``DATASET_ID`` in qualified names (e.g. `signal-ac219` + `signal_staging_analytics`) before running. |
| `schemas/*.schema.json` | BigQuery API **TableFieldSchema** JSON (array of fields) per table — for codegen, validation tooling, or `bq` load. Does **not** encode partition/cluster (see DDL + architecture doc). |

## Applying DDL (manual)

```bash
# Example: staging — project signal-ac219, dataset signal_staging_analytics, location EU
bq --location=EU mk --dataset signal-ac219:signal_staging_analytics
sed -e 's/PROJECT_ID/signal-ac219/g' -e 's/DATASET_ID/signal_staging_analytics/g' ddl/mvp_v1.sql \
  | bq query --use_legacy_sql=false --project_id=signal-ac219 --location=EU
```

Or paste qualified names in your SQL client. **Do not** run against production without review.

## Canonical documentation

- [BigQuery analytical schema v1](../../docs/architecture/bigquery-analytical-schema-v1.md)
