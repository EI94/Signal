# Agent orchestrator (WS5.4)

Thin **orchestration runtime** over the [internal tool registry](internal-tools-v1.md). It does not implement tools, does not call LLMs, and does not route to external providers.

## Role

- Accept one **tool execution request** (`tool`, `input`, optional `correlationId` / `idempotencyKey`).
- Validate the envelope with Zod (`SignalToolExecutionRequestSchema`).
- Delegate to `executeSignalInternalTool` (single source of truth for business execution).
- Re-validate successful outputs with `safeParseInternalToolSuccessOutput` (guardrail if the registry were bypassed or regressed).
- Return a **typed response** (`SignalToolExecutionResponse`) with explicit `status`: `success` | `validation_error` | `execution_error` | `unavailable` | `not_implemented`.
- Invoke optional **metering hooks** (`onExecutionStart` / `onExecutionFinish`) with `durationMs` and outcome — preparation for WS10 usage metering, not a telemetry product.

## Location

- **Contracts:** `packages/contracts` — `agent-orchestrator.ts`
- **Runtime:** `services/intel` — `agent-orchestrator.ts` (`executeSignalToolRequest`)
- **Internal HTTP (optional):** `POST /internal/tools/execute` on `services/intel`, guarded like other intel internal routes (`INTEL_INTERNAL_SECRET` when set).

## What it is not

- No planner, retries, DLQ, workflow engine, or multi-step orchestration (single invocation only).
- No provider adapters (Perplexity, OpenAI, etc.) — those sit **above** this layer in a future epic.
- No sessions, memory, or chat UX.

## Later adapters

Future LLM or search adapters should build **provider-specific prompts and tool lists**, then call `executeSignalToolRequest` (or the HTTP route) with JSON that already matches `SignalToolExecutionRequest`. This keeps Signal’s deterministic pipeline and tool contracts authoritative.

Perplexity (enrichment-only) is documented in [perplexity-adapter-v1.md](perplexity-adapter-v1.md); it is wired through **tools** (e.g. `summarize_delta`), not inside the orchestrator core.
