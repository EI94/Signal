# Fetch pipeline v1

> **WS4.2** — Controlled HTTP GET, fingerprinting, and operational delta classification for the global source registry. Aligns with [Source registry v1](source-registry-v1.md), [GCS source archive v1](gcs-source-archive-v1.md), [Data flow v2](data-flow-v2.md), and [Canonical ontology](canonical-ontology.md). **Version:** v1.

---

## 1. Scope

| In scope (v1) | Out of scope (later epics) |
|-----------------|----------------------------|
| Load active sources from Firestore `sources` | GCS upload, object keys |
| Sequential GET per source | Pub/Sub, schedulers, parallel orchestration |
| Timeouts, max body size, User-Agent | Full retry policies, backoff frameworks |
| Capture status, Content-Type, ETag, Last-Modified | HEAD-based precondition pipelines |
| Normalize bytes/text for SHA-256 fingerprint | HTML cleaning, PDF text extraction |
| Compare fingerprint to `lastContentHash` | Canonical SourceContent persistence |
| Patch operational fields on the registry doc | BigQuery `source_contents` inserts |
| `POST /internal/run-once` summary | Admin UI, crawlers |

---

## 2. Conceptual separation

| Concept | Meaning |
|---------|---------|
| **SourceRegistryDocument** | Configuration + lightweight operational status (`lastContentHash`, `lastFetchedAt`, …). Lives in Firestore. |
| **Fetch runtime result** | Ephemeral outcome per run (`IngestFetchRecord` in contracts): HTTP metadata, hash, delta classification. **Not** a second registry. |
| **SourceContent (future)** | Immutable observation of fetched material with GCS body + analytical metadata. **Not** built in WS4.2. |

The fetch pipeline **does not** collapse these into one object.

---

## 3. Supported source types (MVP)

All use **HTTP GET** to `canonicalUrl` with no special scrapers:

- `web_page`, `rss_feed`, `pdf_endpoint`, `json_api`, `regulatory_feed`

`authRequired: true` → **unsupported_or_skipped** (no credentials in MVP).

---

## 4. HTTP strategy

- **Method:** GET only. **No HEAD:** many origins omit or misreport HEAD; it does not materially improve reliability for MVP.
- **Redirects:** Follow (default fetch).
- **Conditional requests:** Not sent in v1 (ETag/Last-Modified are **recorded** from the response for future use, not used as If-None-Match yet).
- **Timeout:** `SIGNAL_FETCH_TIMEOUT_MS` (default 30s); `timeoutRetryClass: extended` on the registry multiplies by 1.5×.
- **Body cap:** `SIGNAL_FETCH_MAX_BODY_BYTES` (default 10 MiB); enforced via Content-Length when present and after download.
- **User-Agent:** `SIGNAL_FETCH_USER_AGENT` or default `Signal-ingest/<version> (+https://signal.local)`.

---

## 5. Fingerprinting (deterministic)

- Algorithm: **SHA-256**, lowercase hex string.
- **Text-like** Content-Types (`text/*`, JSON, XML, HTML, RSS/Atom hints, JavaScript): UTF-8 decode, normalize CRLF/CR → LF, strip BOM.
- **Binary** (e.g. `application/pdf`, `application/octet-stream`): hash **raw bytes** after decompression (as returned by `fetch`).

This is an operational fingerprint for **delta detection**, not a semantic “same article” guarantee.

---

## 6. Delta decision (operational)

| Condition | `deltaOutcome` |
|-----------|----------------|
| No prior `lastContentHash` on source | `first_seen` |
| Hash equals previous | `unchanged` |
| Hash differs | `changed` |
| Network/timeout/HTTP error / body too large | `fetch_failed` |
| Auth required or non-http(s) URL | `unsupported_or_skipped` |

This is **not** final archival history; WS4.3+ will persist SourceContent and GCS manifests.

---

## 7. Firestore operational updates

Only these fields are patched (never the full document replace, never raw body):

- `lastFetchedAt`, `updatedAt`
- `lastContentHash` — set on successful fingerprint; **omitted** on fetch failure (previous hash retained)
- `fetchStatus` — `healthy` after successful fetch; `failing` after a failed fetch
- `consecutiveFailures` — `0` on success; increment on failure

`lastArchivedGcsUri` is **not** written in WS4.2.

Shared patch helpers: `services/ingest` (`patchSourceOperationalFetchState`) and `apps/api` (`patchSourceOperationalFetchState`) — keep behavior aligned.

---

## 8. Runtime entrypoint

- `GET /healthz` — liveness.
- `POST /internal/run-once` — optional JSON `{ "sourceId": "<uuid>" }` to process one active source; omit body to process all active sources **sequentially**.
- If `INGEST_RUN_ONCE_SECRET` is set, require header `x-signal-ingest-secret: <secret>`.

No scheduler: operators or future Cloud Scheduler call HTTP.

---

## 9. WS4.3 — GCS archive + BigQuery `source_contents` (implemented)

For each **`first_seen`** or **`changed`** outcome only (not `unchanged`, `fetch_failed`, or `unsupported_or_skipped`):

1. **Derive** `source_content_id` = first 32 hex chars of `SHA256(sourceId + ':' + contentFingerprintHex)` where `contentFingerprintHex` is the 64-char lowercase SHA-256 of the **normalized** body (same string as operational `lastContentHash`). See `deriveSourceContentId` in `@signal/contracts`.
2. **Upload** raw response bytes to GCS using `buildRawSourceObjectKey` + `buildGsUri` (extension from registry type + `Content-Type`; see `inferRawArchiveExtension`).
3. **Upload** a JSON manifest (`ArchiveManifestSchema`, `buildManifestObjectKey`) listing the raw artifact with `sha256_hex` of **raw** upload bytes (provenance of the object on disk).
4. **Insert** one row into BigQuery `source_contents` with metadata only (`archived_gcs_uri` = primary raw `gs://` URI; `content_hash` = fingerprint hex; no raw body). Columns: `registry_source_type` = Firestore `sourceType`; `source_type` = content record kind (e.g. `rss_entry`); `mime_type` = HTTP `Content-Type` (see [BigQuery analytical schema v1](bigquery-analytical-schema-v1.md)).
5. **Optional** — **Pub/Sub handoff** (WS4.4): when `SIGNAL_PUBLISH_SOURCE_CONTENT_EVENTS_ENABLED=true`, publish one JSON message to the configured topic (default `source.delta.detected`, Terraform) **after** GCS + BigQuery succeed and **before** patching Firestore success fields. Payload: `SourceContentPersistedEvent` v1 (`eventType: source_content.persisted`) in `@signal/contracts`. If publishing is disabled (default for local dev), the run summary counts `publishSkipped` instead. If publish fails, persistence remains valid and `publishFailed` is incremented (no rollback of GCS/BQ).

6. **Patch** Firestore `sources/{sourceId}` with `lastContentHash`, `lastArchivedGcsUri`, and timestamps — **after** successful GCS + BigQuery (and after the optional publish attempt). If persistence is disabled (`SIGNAL_INGEST_PERSISTENCE_ENABLED=false`), only `lastContentHash` is updated (WS4.2-style).

If GCS or BigQuery fails, the source is marked `failing` and `lastContentHash` is **not** updated so the next run can retry.

**Summary counters** on `POST /internal/run-once` include `archived`, `persisted`, `persistSkipped`, `persistFailed`, `published`, `publishFailed`, `publishSkipped` (see `IngestRunOnceSummary`).

---

## 10. Handoff to extraction / promotion (WS4.4+)

Pub/Sub carries **persisted SourceContent** metadata for `services/intel`. Envelope shape, idempotency keys, retry/DLQ baseline, and scheduler-oriented run-once fields are defined in [Orchestration v1](orchestration-v1.md). **ExtractedEvent** / **Signal** business logic is unchanged by orchestration; intel accepts both wrapped and bare persisted-event JSON on `POST /internal/source-content-persisted`.

---

## 11. Anti-patterns

- Storing response bodies in Firestore.
- Treating fetch delta as immutable audit history.
- Adding HEAD-based “smart” caching without proven value.
- Parallel unbounded fetches against arbitrary URLs.
- Per-source bespoke fetch logic or headless browsers in this layer.
