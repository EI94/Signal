# GCS source archive v1

> Raw and archive-worthy artifacts for Signal. Aligns with [Data flow v2](data-flow-v2.md), [Canonical ontology](canonical-ontology.md), [BigQuery analytical schema v1](bigquery-analytical-schema-v1.md), and Terraform `modules/storage`. **Version:** v1.

---

## 1. Purpose of GCS in Signal

| Store | Role |
|-------|------|
| **GCS (this bucket)** | **Raw bytes** and **derived archive artifacts** (normalized text, manifests). Provenance and replay. Not a query engine. |
| **Firestore** | Operational state, TTL windows, source registry, dashboard read models. **No raw HTML/PDF bodies.** |
| **BigQuery** | Analytical metadata and history (`source_contents.archived_gcs_uri`, trends). **No inline raw bodies.** |

The canonical pipeline remains **SourceContent → ExtractedEvent → Signal**. GCS holds what you need to **reconstruct provenance** for a `source_content_id`, not a second copy of every analytical row.

---

## 2. Bucket foundation (Terraform)

- **Bucket name pattern:** `{project_id}-signal-{environment}-raw` (see `infra/terraform/README.md`).
- **Versioning:** Enabled by default (`versioning_enabled`); supports accidental overwrite recovery and audit trails.
- **Lifecycle:** Optional **age-based delete** via `raw_archive_lifecycle_age_days` (default `null` = no automatic delete). When set (e.g. dev), objects older than N days are removed — **archive conventions still apply**; operators must align retention with compliance.
- **Uniform bucket-level access:** Enabled.
- **Region:** Single-region bucket; align with ingest/intel Cloud Run region.

**Honest scope:** Terraform does **not** create per-prefix IAM or multiple buckets in v1. Path conventions are **repository contracts**; enforcement is by ingestion code (WS4+).

---

## 3. Archive object families (MVP)

| Family | Prefix | Contents |
|--------|--------|----------|
| **Raw snapshot** | `raw/` | Fetched HTML, PDF bytes, JSON API payload, RSS raw body as stored at fetch time. |
| **Normalized text** | `normalized/` | Optional cleaned/extracted text used downstream (e.g. HTML→text, PDF text extraction). Not a substitute for BigQuery metadata. |
| **Manifests** | `manifests/` | Small JSON sidecars linking one `source_content_id` to one or more object keys and content types. |

**Do not** add further top-level families (e.g. `thumbnails/`, `ocr/`) until a near-term consumer exists.

---

## 4. Deterministic object key convention

**Principles:**

- Keys are derived only from **stable ids** (`source_id`, `source_content_id`) and **observation date** — never from mutable display names or arbitrary timestamps as the sole key component.
- **Hive-style date partition:** `date=YYYY-MM-DD` for listing by day without encoding time-of-day in the folder name.
- **One primary file name stem per artifact:** `{source_content_id}` (lowercase hex, 32 chars per ontology) + **extension** indicating format.

**Pattern (v1):**

```
{family}/source/{source_id}/date={YYYY-MM-DD}/{source_content_id}.{ext}
```

Where `{family}` ∈ `raw` | `normalized` | `manifests`.

**Extensions (MVP):**

| ext | Typical use |
|-----|-------------|
| `html` | Raw HTML snapshot |
| `pdf` | Raw PDF bytes |
| `json` | Raw JSON response body |
| `xml` | Raw XML / RSS-as-file |
| `txt` | Normalized or extracted plain text |
| `manifest.json` | Manifest document (only under `manifests/` — full basename `{source_content_id}.manifest.json`) |

**Examples:**

```
raw/source/src_news_001/date=2026-04-04/a1b2c3d4e5f6....html
raw/source/src_news_001/date=2026-04-04/a1b2c3d4e5f6....pdf
normalized/source/src_news_001/date=2026-04-04/a1b2c3d4e5f6....txt
manifests/source/src_news_001/date=2026-04-04/a1b2c3d4e5f6....manifest.json
```

**Full URI:**

`gs://{bucket_name}/{object_key}`

Environment is carried by **bucket name**, not repeated inside the key.

---

## 5. Provenance and references

### BigQuery `source_contents.archived_gcs_uri`

- Points to the **primary raw artifact** for that row (typically one object under `raw/…`).
- Ingestion chooses the canonical raw blob (e.g. main HTML fetch vs PDF — product rule documented at ingest time).

### Multiple GCS objects per SourceContent

- **Allowed:** e.g. raw HTML + separate PDF mirror + normalized `.txt`.
- **How:** The **manifest** under `manifests/…/{source_content_id}.manifest.json` lists all artifact keys + roles. BigQuery may store the primary URI only; full graph is recoverable from GCS manifest + same `source_content_id`.

### ExtractedEvent / Signal

- Events reference **source_content_id** (and evidence ids in BigQuery); they do **not** embed GCS paths in Firestore operational docs beyond what product needs — analytical lineage stays in BQ + GCS manifest.

---

## 6. Manifest philosophy

- **Small JSON**, machine-readable, versioned with `schema_version` field.
- Lists **relative object keys** (no `gs://` duplication) or full URIs — v1 standard: **relative keys from bucket root** for portability.
- Optional hash per artifact for integrity checks.

See `infra/gcs/examples/` for a non-normative example file.

---

## 7. Anti-patterns

- Using GCS as a **metadata database** (queries by listing millions of keys ad hoc without BQ/Firestore indexes).
- Storing **full analytical history** only in GCS (belongs in BigQuery).
- **Mutable paths** depending on titles, URLs slugs, or “misc” folders.
- **Huge JSON** or ML blobs in manifests — keep manifests lean.
- **Raw bodies in Firestore or BigQuery table cells** — forbidden.

---

## 8. MVP vs later

| MVP (v1) | Later |
|----------|--------|
| Three families + deterministic keys | Additional families (e.g. OCR) with new prefix + doc revision |
| Manifest optional but recommended for multi-artifact | Automated manifest validation in CI |
| Single bucket | Extra buckets only with strong isolation need |

---

## 9. Related artifacts

- Conventions cheat sheet: [infra/gcs/archive-conventions.md](../../infra/gcs/archive-conventions.md)
- Path builders (deterministic strings): `packages/contracts` — `gcs-archive-paths.ts`
- Schemas: `ArchiveManifestSchema`, `ArchiveArtifactRefSchema` (ingestion validation, WS4)
