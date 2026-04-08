# BigQuery analytical schema v1

> Analytical / historical layer for Signal. Aligns with [Data flow v2](data-flow-v2.md), [Canonical ontology](canonical-ontology.md), and [Scoring model v1](scoring-model-v1.md). **Version:** v1 (reviewable; evolve via new doc revision + schema artifacts).

---

## 1. Purpose of BigQuery in Signal

| Store | Role |
|-------|------|
| **GCS** | Immutable raw bytes (HTML/PDF/JSON), provenance blobs. Object key conventions: [GCS source archive v1](gcs-source-archive-v1.md). |
| **Firestore** | Operational / product read models, TTL windows, user-facing latency. |
| **BigQuery** | **Durable analytical history**: trends, scoring history, audit-friendly queries, reporting and future briefing/alert analytics. **Not** the primary API serving store for live UI reads. |

BigQuery rows may hold **structured metadata and JSON facts**; they must **not** duplicate full raw HTML/PDF bodies or replace GCS as the archive of record.

---

## 2. Dataset strategy

- **Dataset ID (per environment):** `signal_<env>_analytics` (e.g. `signal_dev_analytics`), provisioned by Terraform (`infra/terraform/modules/bigquery`).
- **Location:** Same region as org policy (e.g. `EU` / `europe-west1`); set once per project.
- **Tables:** Live in this dataset; **table DDL is not applied by Terraform** in v1 (dataset + IAM only). Tables are created from repo artifacts (`infra/bigquery/ddl/`) during bootstrap or CI/CD when ingestion lands.

---

## 3. Three-layer pipeline (analytical)

Analytical tables preserve **SourceContent → ExtractedEvent → Signal** as distinct entities:

| Layer | Table(s) | Notes |
|-------|-----------|--------|
| Source content | `source_contents` | One row per fetched content snapshot (metadata + GCS pointer). |
| Extracted event | `extracted_events` | Candidate facts; may reference multiple source contents. |
| Signal | `signals`, `signal_score_history`, `entity_signal_links` | Normalized product signals + score timeline + entity bridge. |

Downstream **metadata** (not full pipelines in this epic):

| Table | Purpose |
|-------|---------|
| `brief_runs` | Brief generation run outcomes (period, status, pointers). |
| `alert_evaluations` | Alert rule evaluation outcomes per signal. |
| `usage_events` | WS10.1 append-only usage metering (pipeline + provider + email + tool execution). See [usage-metering-v1.md](./usage-metering-v1.md). |

---

## 4. Table catalog (MVP v1)

| Table | Responsibility |
|-------|----------------|
| `source_contents` | Historical metadata for each fetched source content record; `archived_gcs_uri` points to raw blob, not stored inline. |

#### `source_contents` column semantics (v1)

To avoid mixing **registry**, **content record**, and **HTTP** concepts:

| Column | Meaning |
|--------|---------|
| `registry_source_type` | **Source registry** type from Firestore `Source.sourceType` (`web_page`, `rss_feed`, `pdf_endpoint`, `json_api`, `regulatory_feed`). Describes the registered endpoint. |
| `source_type` | **Content record type** (ontology / persisted artifact kind), e.g. `rss_entry` for an RSS source, `pdf_document` for a PDF endpoint. Aligns with [Glossary](glossary-v1.md) SourceContent `sourceType`. |
| `mime_type` | HTTP response **`Content-Type`** (MIME) from the fetch, e.g. `text/html; charset=utf-8`. Not a registry enum and not the ontology `source_type`. |
| `normalized_gcs_uri` | Optional `gs://` pointer to normalized `.txt` under the `normalized/` family (after `services/intel` intake). |
| `extraction_status` | Short lifecycle for downstream processing; see vocabulary below. |
| `extraction_error_code` | Optional machine code when status is `normalization_skipped`, `normalization_failed`, `extraction_failed`, or `promotion_failed`. |
| `extracted_event_count` | Number of rows written to `extracted_events` for this SourceContent (nullable until extraction runs). |

`content_hash` remains the normalized-body SHA-256 hex used for delta detection (same as operational `lastContentHash` on the source).

**`extraction_status` vocabulary (MVP):** `pending` (ingest default) → `normalized_ready` | `normalization_skipped` | `normalization_failed` | `awaiting_pdf_text_extraction` → after deterministic extraction (WS5.1): `extracted_ready` | `no_events_detected` | `extraction_failed` → after deterministic Signal promotion (WS5.2): `promoted_ready` | `promotion_failed`. Firestore `signalsLatest` is updated only on successful promotion. Defined in `@signal/contracts` (`SourceContentExtractionStatusSchema`).

| Table | Responsibility |
|-------|----------------|
| `extracted_events` | Extracted candidate events; `evidence_source_content_ids` links evidence; JSON payloads for facts/entity refs. |
| `signals` | Append-only or upsert-friendly **analytical** history of signals (title, scores snapshot, times). Distinct from Firestore `signalsLatest` read model. |
| `signal_score_history` | Dimension scores + composite score over time (`scoring_version` for model evolution). |
| `entity_signal_links` | Denormalized bridge for entity-centric timelines and queries. |
| `brief_runs` | Brief job metadata (period, status, optional model-assisted flag). |
| `alert_evaluations` | **Append-only** evaluation history: one row per evaluation **event** (outcome, reason, cooldown). `evaluation_id` is unique per event (see [Alert rules engine v1](alert-rules-engine-v1.md)); not a latest-state key on `(workspace, rule, signal)` alone. |

---

## 5. Partitioning and clustering

Practical defaults (tune with real volume):

| Table | Partition field | Cluster fields | Rationale |
|-------|-----------------|------------------|-----------|
| `source_contents` | `DATE(observed_at)` | `source_id`, `source_type` | Time-series scans; filter by source and content-record kind (`source_type` is ontology, not registry). |
| `extracted_events` | `DATE(event_time)` | `event_family` | Event-time analytics; family filters. |
| `signals` | `DATE(detected_at)` | `signal_type`, `workspace_id` | Dashboard-style filters by type/workspace. |
| `signal_score_history` | `DATE(scored_at)` | `signal_id` | Score timelines per signal. |
| `entity_signal_links` | `DATE(detected_at)` | `entity_type`, `entity_id` | Entity timeline queries. |
| `brief_runs` | `DATE(created_at)` | `workspace_id` | Workspace-scoped reporting. |
| `alert_evaluations` | `DATE(evaluated_at)` | `workspace_id`, `alert_rule_id` | Rule diagnostics. |

**Rules:** Do not partition every table on `created_at` only; prefer domain time (`observed_at`, `event_time`, `detected_at`, `scored_at`, `evaluated_at`) where queries are expected to filter.

---

## 6. JSON field usage

- Columns storing structured payloads end with **`_json`** (e.g. `extracted_facts_json`, `entity_refs_json`, `linked_entity_refs_json`).
- In BigQuery, type **`JSON`** is preferred when available; otherwise **`STRING`** with documented JSON contract (ingestion must validate before load).
- **Max size:** JSON fields hold **facts and references**, not megabyte blobs. Large text belongs in GCS.

---

## 7. Evolution and backfills

- **Scoring:** `signal_score_history.scoring_version` (e.g. `scoring-v1`) identifies the model. New models append rows; old rows remain queryable.
- **Extracted facts:** `extracted_events.extracted_facts_json` evolves by **additive** keys where possible; breaking changes require a new optional field or version bump documented in ingestion.
- **Backfills:** Use batch jobs writing new partitions or MERGE patterns; never silently overwrite historical rows without a documented migration.
- **Schema artifacts:** Changes bump **`v1` → `v2`** in filenames + this doc revision when tables are materially altered.

---

## 8. Anti-patterns (do not)

- Storing **raw page bodies** or full PDFs in BigQuery.
- Using BigQuery as **authoritative operational store** for user-facing “current” signals (use Firestore + API).
- **Duplicating** Firestore documents into BigQuery without a clear analytical reason (denormalized bridges like `entity_signal_links` are intentional; blind copy is not).
- **Wide derived marts** with no near-term consumer.
- **One table per signal type** (use `signal_type` column + clustering).

---

## 9. Related artifacts

- Executable DDL: `infra/bigquery/ddl/mvp_v1.sql`
- Field-level JSON (BigQuery API schema): `infra/bigquery/schemas/*.schema.json`
- Shared Zod helpers (ingestion validation only): `packages/contracts` — `SignalScoreSnapshotSchema`, `EntitySignalLinkRowSchema`

---

## 10. Firestore vs BigQuery (sharp boundary)

| Concern | Firestore | BigQuery |
|---------|-----------|----------|
| Latest signal for dashboard | `signals_latest` (TTL) | `signals` history + aggregates |
| User prefs / alert rules live config | Yes | Optional snapshots only |
| Full-text raw source | No (GCS) | No |
| Trend / score over months | Not primary | Yes |
