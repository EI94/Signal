# Serving API contracts v1 (WS6.1)

Authoritative **Zod** request/response modules in `packages/contracts` for the first product-facing read surfaces. They describe **wire shapes only** — implementation lives in WS6.2 read models and route handlers.

## Principles

- **Public** routes are versioned under `/v1/...` and return summary DTOs, not Firestore documents or BigQuery rows.
- **Internal** contracts (`api-internal-v1.ts`) are for authenticated admin/ops paths; they stay narrow.
- Errors use the stable envelope `{ error: { code, message, requestId } }` (`ApiErrorEnvelopeV1Schema`), aligned with `apps/api` `sendErrorResponse`.
- Fields are optional only when the read model may legitimately omit data (e.g. map `lat`/`lng` before geo resolution).

## Contract modules

| Module | Route(s) | Purpose |
|--------|----------|---------|
| `api-serving-shared.ts` | — | `SignalSummaryV1`, cursor pagination, workspace scope query. |
| `api-board-summary.ts` | `GET /v1/board/summary` | Home / executive board; optional narrative `highlights` when aggregated copy exists. |
| `api-signals.ts` | `GET /v1/signals` | Paginated signal feed with filters + sort. |
| `api-entities.ts` | `GET /v1/entities/:entityType/:entityId` | Entity identity + recent signals + optional timeline preview. |
| `api-map.ts` | `GET /v1/map/signals` | Map points; `lat`/`lng` optional; `regionKey` fallback. |
| `api-briefs.ts` | `GET /v1/briefs`, `GET /v1/briefs/:briefId` | Brief **metadata** only (aligned with Firestore `BriefDocument` intent). |
| `api-alerts.ts` | `GET /v1/alerts/rules` | Rule summaries (no full authoring payload). |
| `api-notifications.ts` | `GET /v1/notifications`, `PATCH /v1/notifications/:notificationId` | Notification list + pagination; `PATCH` sets `read` or `dismissed` only for **user-targeted** items (`userId` present). Broadcast items (no `userId`) are immutable via `PATCH` (**409** `BROADCAST_NOTIFICATION_IMMUTABLE`). |
| `api-internal-v1.ts` | internal ops | Source summaries, trigger body, re-export of tool execution request schema. |
| `api-error-envelope.ts` | all | Error JSON shape. |

## Not in this epic

- Route handlers, repositories, and caching (WS6.2).
- OpenAPI generation (optional later).
- Broad admin CRUD or kitchen-sink DTOs.

## Relationship to storage

| Layer | Role |
|-------|------|
| Firestore | Operational / latest (e.g. `signalsLatest`, notifications, brief metadata). |
| BigQuery | Analytical history; serving APIs must not expose raw analytical rows as public contracts. |

Read models in WS6.2 map storage → these DTOs. WS6.3 adds explicit **query semantics** (filters, sorts, keyset cursors, minimal facets, entity timeline query params) — see [read-models-v1.md](./read-models-v1.md).
