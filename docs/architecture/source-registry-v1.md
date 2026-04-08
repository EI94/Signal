# Source registry v1

> Canonical **Source** definitions for Signal: what to monitor, how to fetch it (metadata only), and how downstream stages should interpret it. Aligns with [Canonical ontology](canonical-ontology.md), [Entity taxonomy — Source](entity-taxonomy-v1.md#6-source), [Relationships and identity](relationships-and-identity-v1.md), and [Data flow v2](data-flow-v2.md). **Version:** v1.

---

## 1. Purpose

The **source registry** is the system-level configuration layer that answers:

- What is this source (identity, URL, type)?
- What domain does it belong to (category)?
- How much should we trust it and how urgent is it (authority, priority)?
- How should ingest treat HTTP/fetch and parsing (strategies)?
- Which entities is it primarily about (`EntityRef` links only — no embedded entities)?

It is **not** a dump of arbitrary JSON, not a crawler graph, and not a place for raw bytes or extracted text.

---

## 2. Why this is not SourceContent

| Concept | Role | Typical storage |
|--------|------|-----------------|
| **Source (registry)** | Stable configuration: one row per monitored endpoint/page/feed. | Firestore `sources/{sourceId}` |
| **SourceContent** | One immutable observation of fetched material for a source at a point in time. | GCS (body), BigQuery metadata, optional Firestore active window |

The registry tells **what** to fetch; SourceContent is **what was fetched** when a change (or first run) is detected. Registry documents may carry **optional ingest-maintained** fields (`lastFetchedAt`, `lastContentHash`, etc.) updated by `services/ingest` in later epics — those are operational state on the same config row, not the content itself.

---

## 3. Firestore placement (MVP)

- **Collection:** top-level `sources`.
- **Document path:** `sources/{sourceId}`.
- **Document ID:** must equal the `sourceId` field on the document.

**Rationale:** Sources are **system-wide pipeline configuration**, not per-user or per-workspace preferences. Workspace-scoped filtering (watchlists, saved views) applies to **entities and signals**, not to redefining what a global source is. A single global registry keeps the model honest for MVP and avoids duplicating the same RSS URL across workspaces.

---

## 4. Canonical schema (summary)

The single Zod contract is `SourceRegistryDocumentSchema` in `packages/contracts` (`source-registry.ts`). Highlights:

| Area | Fields |
|------|--------|
| Identity | `sourceId` (UUID), `name`, `canonicalUrl`, `sourceType` |
| Classification | `category` (domain), `sourceType` (transport/kind) |
| Status | `isActive`, `authorityScore` (0–100), `priorityTier`, optional `lastReviewedAt` |
| Fetch (WS4.2) | `fetchStrategy`: method hint, frequency bucket, optional retry class, `etagSupport`, `authRequired` |
| Parser (WS4.2+) | `parserStrategy`: `parserStrategyKey`, optional language and expected content kind |
| Linkage | `linkedEntityRefs`: `EntityRef[]` (minimal pointers; no embedded ontology) |
| Admin | `createdAt`, `updatedAt`, optional `createdBy`, optional `notes` (short) |
| Ingest (optional) | `lastFetchedAt`, `lastContentHash`, `lastArchivedGcsUri`, `fetchStatus`, `consecutiveFailures` |

**Raw content, signals, and events** do not belong on this document.

---

## 5. Source type (`sourceType`)

MVP values (aligned with [Entity taxonomy](entity-taxonomy-v1.md)):

| Value | Meaning |
|-------|--------|
| `web_page` | Single HTML page or small site leaf URL. |
| `rss_feed` | RSS/Atom feed URL. |
| `pdf_endpoint` | URL whose primary payload is PDF. |
| `json_api` | JSON HTTP API (rest or similar). |
| `regulatory_feed` | Regulatory / filing-oriented source (may still be HTML or RSS). |

Content-level types (e.g. `rss_entry` on SourceContent) remain on the **SourceContent** object, not the registry.

---

## 6. Source category (`category`)

Subject/domain tag for routing, filtering, and future scoring — not a second copy of `sourceType`:

`competitor` | `client` | `commodity` | `policy_regulatory` | `technology` | `corporate_reporting` | `project_pipeline` | `general_market` | `other`

---

## 7. Trust, priority, frequency (philosophy)

- **`authorityScore` (0–100):** Single comparable trust signal for downstream scoring (aligned with “source authority” in the ontology). Higher = more credible for the same extracted fact.
- **`priorityTier`:** Scheduling/importance (`p0_critical` … `p3_low`) — orthogonal to authority (e.g. a low-authority source can still be high priority if the product cares about timeliness).
- **`fetchStrategy.checkFrequencyBucket`:** How often to check (`hourly`, `every_6h`, `daily`, `weekly`) — buckets only in v1; a real cron/scheduler lands in WS4.2+.

---

## 8. EntityRef linkage

`linkedEntityRefs` uses the shared `EntityRef` shape (`entityType`, `entityId`, optional `displayName`). Use it to say “this IR page is primarily about organization X” without embedding the entity document.

---

## 9. Relationship to downstream pipeline

```
Source (registry) → ingest fetches → SourceContent → intel → ExtractedEvent → Signal
```

- **GCS:** Archive layout per [gcs-source-archive-v1.md](gcs-source-archive-v1.md); `lastArchivedGcsUri` on Source is optional operational pointer, not a substitute for SourceContent provenance.
- **BigQuery:** Historical `source_contents` rows reference `source_id` and `archived_gcs_uri`. The column `registry_source_type` stores this document’s `sourceType`; analytical `source_type` is the separate **content record** kind (see [BigQuery analytical schema v1](bigquery-analytical-schema-v1.md)). Raw bodies are not stored in BigQuery.
- **Firestore:** Product read models stay workspace-scoped; registry stays global.

---

## 10. MVP vs later

**In scope (v1):** Schema, Firestore location, repository read/write helpers, documentation.

**Later:** HTTP fetch, conditional requests, hashing, GCS upload, Pub/Sub, admin API routes, composite Firestore indexes if `listActiveSources` grows too large, workspace-specific *views* over sources (not duplicate source definitions).

---

## 11. Anti-patterns

- Storing **raw HTML/PDF bodies** or full **extracted text** in the registry document.
- Embedding **signals**, **events**, or **scores** on the source row.
- **Workspace-specific** source definitions (for MVP) or user preference fields mixed into the global definition.
- Large **unstructured config blobs** or per-source bespoke code paths in the schema.
- Using the registry as a **generic key-value** store or “misc config” bucket.

---

## 12. References

- Implementation: `packages/contracts/src/source-registry.ts`, `apps/api/src/lib/firestore/paths.ts` (`sources`), `apps/api/src/repositories/source-registry-repository.ts`.
- Sample JSON (dev/reference only): `infra/sources/sample-sources.json`.
