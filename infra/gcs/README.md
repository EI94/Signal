# GCS — source archive conventions (WS3.3)

This directory holds **versioned, reviewable** conventions for the **raw archive bucket** provisioned by Terraform (`infra/terraform/modules/storage`). The bucket name follows `{project_id}-signal-{environment}-raw`.

## Contents

| File | Purpose |
|------|---------|
| [archive-conventions.md](./archive-conventions.md) | Short normative summary (paths, families, extensions) |
| [examples/](./examples/) | Example manifest JSON (no binaries) |

## Canonical documentation

- [GCS source archive v1](../../docs/architecture/gcs-source-archive-v1.md) — full architecture: provenance, lifecycle, BigQuery linkage, anti-patterns

## Terraform

- Bucket versioning and optional lifecycle age: see `modules/storage` and `infra/terraform/README.md`.
- **Tables are not created here** — only naming contracts for ingestion (WS4).
