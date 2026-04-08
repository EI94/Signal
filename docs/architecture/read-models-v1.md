# Serving read models v1 (WS6.2)

Thin **read-model modules** in `apps/api/src/read-models/` compose **Firestore** (operational/latest) and optionally **BigQuery** (entity timeline) into the WS6.1 **Zod** DTOs. Route handlers validate input/output with contracts and do not query storage directly.

## Firestore vs BigQuery

| Surface | Primary store | Notes |
|--------|---------------|--------|
| Board summary, signal feed, map signals | `signalsLatest` | Bounded window: at most **500** documents ordered by `detectedAt` desc per request. |
| Entity detail — recent signals | `signalsLatest` | In-memory filter on `entityRefs` within the same window. |
| Entity detail — `timelinePreview` | BigQuery `entity_signal_links` when `SIGNAL_BIGQUERY_DATASET` is set | Otherwise timeline rows are derived from linked Firestore signals only (honest fallback). |
| Notifications, briefs, alert rules | Firestore subcollections | List scans are capped (e.g. 200 docs) with in-memory filters where needed. Notification **writes** (`PATCH` → `read` / `dismissed`) apply only to **user-targeted** docs (`userId` set). Docs without `userId` are **workspace broadcast** (visible per list rules) and are **immutable** via this API — `PATCH` returns **409** `BROADCAST_NOTIFICATION_IMMUTABLE`. |

## Pagination (WS6.3)

**Signal feed (`GET /v1/signals`)** uses a **bounded Firestore window** (max 500 `signalsLatest` docs). Within that window:

- **Default next page token** is a **keyset cursor** (`v: 2`): `{ sort, primary, signalId }` where `primary` is `detectedAt` ms, `occurredAt` ms, or rounded `score` depending on `sort`. It identifies the last row of the current page; the next page starts at the following row in the **same** sort order.
- **Legacy offset cursor** (`v: 1`, `{ o: number }`) remains accepted for the same bounded list.

**Entity timeline** (`timelinePreview` on `GET /v1/entities/...`) uses **`timelineCursor`**: `v: 1` with `{ detectedAt, signalId }` (base64url JSON). With BigQuery, the same anchor is applied as a parameterized seek (`detected_at` / `signal_id`) plus optional filters (`timelineSignalType`, `timelineStatus`, `timelineMinScore`, time bounds).

## Facets (WS6.3)

`GET /v1/signals` may include **`facets`**: `{ signalTypes, statuses, novelties }` as `{ value, count }[]` buckets computed **only** from the **fully filtered** in-memory window (same filters as the list, no pagination). Omit with `includeFacets=false`.

## Signal type safety

`LatestSignalDocument.signalType` is a string; public summaries use `ExtractedEventFamilyMvp`. The mapper **drops** non-enum values (no silent coercion).

## Configuration

See `packages/config` `loadApiRuntimeConfig`: optional `SIGNAL_BIGQUERY_DATASET` and `SIGNAL_BIGQUERY_ENTITY_SIGNAL_LINKS_TABLE` enable the entity timeline query.
