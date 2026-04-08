# apps/api (Fastify)

## Security / audit baseline (WS2.3)

- **Request ID:** Every response includes `X-Request-Id`. Inbound `X-Request-Id` is reused when valid (8–128 chars, `[A-Za-z0-9-]+`); otherwise a UUID is generated. Error JSON bodies include `error.requestId` for correlation.
- **Structured logs:** Security-relevant events use Pino JSON with `kind: "security"`, `eventType` (see `src/lib/audit-events.ts`), `requestId`, `method`, `path`, and optional `uid` / `workspaceId` / `role` / `reasonCode`. Tokens are never logged.
- **Headers:** Baseline API headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) are set on all responses via `onSend`.
- **CORS:** Allowed origins come from `CORS_ORIGINS`; methods are `GET`, `HEAD`, `OPTIONS`; allowed headers include `Authorization`, `X-Signal-Workspace-Id`, `X-Request-Id`; `X-Request-Id` is exposed to browsers.

No persistent audit store; logs only.

## Firestore operational schema (WS3.1)

- **Source registry (WS4.1):** Global collection `sources/{sourceId}` — `SourceRegistryDocumentSchema` in `packages/contracts` (`source-registry.ts`). Repository: `src/repositories/source-registry-repository.ts`. Not workspace-scoped; see [docs/architecture/source-registry-v1.md](../../docs/architecture/source-registry-v1.md).

- **Contracts:** Zod schemas live in `packages/contracts` (`firestore-operational.ts`, `workspace-role.ts`). They describe operational read models only — not BigQuery history, not raw source payloads.
- **Paths:** `src/lib/firestore/paths.ts` defines canonical **camelCase** collection segment names (`signalsLatest`, `savedViews`, …) and string helpers for logging.
- **Refs:** `src/lib/firestore/refs.ts` exposes `workspaceRootRef` / `workspaceMemberRef` (no generic ORM).
- **Membership:** `src/repositories/workspace-repository.ts` resolves authz using `WorkspaceRootDocumentSchema` + `WorkspaceMemberDocumentSchema`, with shallow `Timestamp` normalization in `src/lib/firestore/timestamps.ts`.
- **Parsers:** `src/lib/firestore/parse-documents.ts` validates snapshots for serving read models (signals latest, notifications, briefs, alert rules, etc.).

Workspace layout (all under `workspaces/{workspaceId}/…` except the root doc): `members`, `watchlists`, `savedViews`, `signalsLatest`, `notifications`, `featureFlags`, `briefs`, `alertRules`.

## BigQuery (historical analytics)

Operational read models stay in Firestore; **durable history** uses BigQuery (`signal_<env>_analytics`). See [docs/architecture/bigquery-analytical-schema-v1.md](../../docs/architecture/bigquery-analytical-schema-v1.md) and [infra/bigquery/README.md](../../infra/bigquery/README.md).

**WS6.2:** Optional BigQuery reads (`entity_signal_links`) power entity **timeline** previews when `SIGNAL_BIGQUERY_DATASET` is set — see [docs/architecture/read-models-v1.md](../../docs/architecture/read-models-v1.md). Client: `src/lib/bigquery/`.

## Serving routes (WS6.2)

Authenticated + workspace-resolved `GET` routes under `/v1`: `board/summary`, `signals`, `entities/:entityType/:entityId`, `map/signals`, `notifications`, `briefs`, `briefs/:briefId`, `alerts/rules`. Handlers live in `src/routes/serving-v1.ts`; storage composition in `src/read-models/`.

## GCS (raw archive)

**Raw bytes and manifests** live in the Terraform-provisioned bucket (`{project}-signal-{env}-raw`). Path rules and manifests: [docs/architecture/gcs-source-archive-v1.md](../../docs/architecture/gcs-source-archive-v1.md), [infra/gcs/README.md](../../infra/gcs/README.md). Shared path builders: `@signal/contracts` (`buildRawSourceObjectKey`, etc.). No GCS SDK in `apps/api` yet (WS3.3).
