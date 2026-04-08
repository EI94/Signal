# Tool exposure layer (WS11.1 / v1)

Stable **product-facing** tool surface for future agents and external orchestrators. This is **not** the internal tool registry and **not** the intel agent orchestrator — it sits above read models and optionally bridges to intel over HTTP.

## Roles

| Layer | Location | Responsibility |
|-------|----------|------------------|
| Internal registry | `services/intel` — `executeSignalInternalTool` | Typed internal capabilities (`fetch_source`, `generate_brief`, …). |
| Orchestrator | `executeSignalToolRequest` | Single-invocation envelope + metering over the registry. |
| **Tool exposure** | `apps/api` — `/v1/tools/*` | Curated **exposed** names, auth/workspace enforcement, read = in-process read models, action = HTTP to intel when configured. |

No second orchestrator: exposure **dispatches** one call; it does not plan multi-step workflows.

## Routes (authenticated)

- `GET /v1/tools` — static list (`EXPOSED_TOOL_DESCRIPTORS` from contracts).
- `GET /v1/tools/capabilities` — MCP-ready capability descriptors (WS11.2): `listMcpReadyCapabilities()`; see [mcp-ready-boundary-v1](./mcp-ready-boundary-v1.md).
- `POST /v1/tools/execute` — body `ToolExposureExecuteRequestSchema`: `{ tool, input?, correlationId?, idempotencyKey? }` (executes via `invokeViaMcpReadyAdapter` → `executeExposedTool`).

Workspace is always taken from the existing **auth + workspace membership** resolution (`requireAuth`, `createResolveWorkspaceMembership`). Callers must not send `workspaceId` inside `input` for exposed schemas (it is injected server-side for action tools).

## Exposed tools (v1)

| Exposed name | Kind | Under the hood |
|--------------|------|------------------|
| `board_summary.get` | read | `buildBoardSummaryFromWindow` (same as GET `/v1/board/summary`) |
| `signals_feed.get` | read | `buildSignalsFeedFromWindow` (same contract as GET `/v1/signals`) |
| `entity_context.get` | read | `buildEntityDetailReadModel` (entity type/id + timeline query fields) |
| `map_signals.get` | read | `buildMapSignalsFromWindow` |
| `brief.generate` | action | `POST` intel `/internal/generate-brief` |
| `brief.send_email` | action | `POST` intel `/internal/send-brief-email` |
| `alerts.evaluate` | action | `POST` intel `/internal/evaluate-alerts` |
| `alerts.send_email` | action | `POST` intel `/internal/send-alert-email` |
| `source.fetch` | action | `POST` intel `/internal/tools/execute` with `tool: "fetch_source"` |

## Configuration (api)

- `SIGNAL_TOOL_INTEL_BASE_URL` — base URL for intel (e.g. `http://localhost:4002`). If unset, **action** tools return `503` with exposure error code `UNAVAILABLE`.
- `SIGNAL_TOOL_INTEL_SECRET` — optional; sent as `x-signal-intel-secret` (same secret as intel `INTEL_INTERNAL_SECRET` when intel protects internal routes).

## Contracts

- `packages/contracts/src/tool-exposure.ts` — exposed names, per-tool input schemas (workspace omitted), `ToolExposureExecuteResponseSchema`, static descriptors.

## Intentionally not in v1

- Full MCP protocol server (WS11.2 adds only a **boundary** + capabilities route; see [mcp-ready-boundary-v1](./mcp-ready-boundary-v1.md)).
- Chat UI.
- Tools that duplicate registry internals without product naming (`extract_events`, `score_signal`, `summarize_delta`) — still available via intel internal routes / registry, not duplicated here.

## Response envelope

Success: `{ ok: true, tool, kind: 'read' | 'action', output }` — `output` matches the relevant serving or intel contract (validated server-side where feasible).

Failure: `{ ok: false, tool, code, message, details? }` with HTTP status `400` / `502` / `503` / `500` depending on `code`.
