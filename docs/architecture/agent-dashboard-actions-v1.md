# Agent→dashboard actions (WS11.3 / v1)

Small **product verbs** for bridging tool/agent calls into real UI navigation and the same execution paths as [tool exposure](./tool-exposure-v1.md). Not an agent runtime, not a workflow engine.

## Roles

| Layer | Responsibility |
|-------|----------------|
| Exposed tools + MCP-ready adapter | Capability + validation + `executeExposedTool`. |
| **Agent dashboard actions** | Named product actions, `nextContext` routes, audit log line on execute. |

## Supported actions

| Action | Kind | Maps to exposed tool |
|--------|------|----------------------|
| `brief.create` | effectful | `brief.generate` |
| `brief.send_email` | effectful | `brief.send_email` |
| `alerts.evaluate` | effectful | `alerts.evaluate` |
| `alerts.send_email` | effectful | `alerts.send_email` |
| `context.open_board` | read | `board_summary.get` |
| `context.open_signals` | read | `signals_feed.get` |
| `context.open_entity` | read | `entity_context.get` |

`notification.create` is intentionally omitted (no tiny operational target in this epic).

## API (authenticated)

- `GET /v1/actions` — static `AGENT_DASHBOARD_ACTION_DESCRIPTORS`.
- `POST /v1/actions/execute` — body `AgentDashboardActionExecuteRequestSchema`: `{ action, input?, correlationId? }`.

Workspace scope matches other `/v1/*` routes (membership; no `workspaceId` in JSON).

## Navigation hints

`nextContext` uses **App Router** paths under `apps/web`: `/`, `/signals`, `/signals?…`, `/entities/{type}/{id}`, `/notifications`. Query strings for signals mirror GET `/v1/signals` parameter names (camelCase). The signals page may not yet read all query params client-side; hints remain valid for deep-linking and agents.

## Auditability

`POST /v1/actions/execute` emits a structured security log (`agent_actions.executed`) with outcome and action name (`reasonCode`). No separate audit store.

## Intentionally deferred

- Autonomous planning, chat UI, generic command DSL.
- Notification creation unless a clear Firestore/API target exists later.
