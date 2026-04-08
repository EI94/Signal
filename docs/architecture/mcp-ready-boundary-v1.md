# MCP-ready adapter boundary (WS11.2 / v1)

Thin layer **above** the [tool exposure](./tool-exposure-v1.md) surface so future MCP (or similar) transports can list capabilities and invoke tools **without** embedding protocol details in read models or intel.

## Three layers

| Layer | Role |
|-------|------|
| Internal registry / orchestrator | Execution core in `services/intel`. |
| Tool exposure | Stable names, auth/workspace, `POST /v1/tools/execute`. |
| **MCP-ready boundary** | Transport-neutral descriptors + single validation→execution adapter (`invokeViaMcpReadyAdapter`). |

This is **not** an MCP server: no JSON-RPC, no stdio, no session host. It is **metadata + a thin invoke shim** aligned with exposed tools only.

## Contracts (`packages/contracts`)

- `listMcpReadyCapabilities()` — curated `McpReadyCapabilityV1` list: name, kind, availability, **manual** JSON-Schema-style `inputSchemaProjection` / `outputSchemaProjection`, auth/workspace notes.
- Authoritative input validation remains **`parseExposedToolInput`** (same as HTTP).

Projections are **hints** for orchestrators and future MCP tool listings; they are not a generic Zod→JSON-Schema engine.

## API (`apps/api`)

- `GET /v1/tools/capabilities` — authenticated; returns `McpReadyCapabilitiesListV1ResponseSchema`.
- `POST /v1/tools/execute` — unchanged contract; implementation calls **`invokeViaMcpReadyAdapter`** (parse + `executeExposedTool`).

## Intentionally deferred (real MCP, later)

- MCP SDK server, `tools/call` transport, OAuth for MCP clients.
- Streaming or bidirectional sessions.
- Any duplication of business logic outside `executeExposedTool`.

## Follow-up (WS11.4+)

Wire a minimal MCP server that maps `McpReadyCapabilityV1` to MCP tool definitions and forwards invocations to the same adapter or to authenticated HTTP against the API.

Product-oriented verbs and dashboard `nextContext` live in [agent-dashboard-actions-v1](./agent-dashboard-actions-v1.md) (WS11.3).
