# Internal tools registry (WS5.1)

Typed, provider-agnostic registry of **internal** capabilities for future orchestration. No LLM, no agent framework — only explicit schemas and thin wiring to existing services.

## Location

- **Contracts:** `packages/contracts` — `internal-tools.ts` (tool ids, Zod input/output, invoke result envelope).
- **Runtime:** `services/intel` — `internal-tool-registry.ts`, `invoke-ingest-for-internal-tool.ts`.

## Tools

| Tool | Declaration | Runtime behavior |
|------|----------------|------------------|
| `fetch_source` | `requires_configuration` until `SIGNAL_TOOL_INGEST_BASE_URL` is set; then `implemented` | `POST {base}/internal/run-once` on **ingest** (HTTP; respects monorepo service boundaries). Optional header `x-signal-ingest-secret` from `SIGNAL_TOOL_INGEST_RUN_ONCE_SECRET`. |
| `extract_events` | `implemented` | `processExtractSourceContent` (deterministic extraction). |
| `score_signal` | `implemented` | `processPromoteSourceContentSignals` (deterministic promotion + scoring; name reflects product vocabulary, not a separate “score-only” API). |
| `summarize_delta` | `requires_configuration` until Perplexity env is set; then `implemented` | Optional **enrichment** via Perplexity (`callPerplexitySummarizeDelta`); see [perplexity-adapter-v1.md](perplexity-adapter-v1.md). Not used by deterministic ingest/extract/score. |
| `generate_brief` | `not_implemented` | Same. |
| `evaluate_alerts` | `not_implemented` | Same. |

Listing uses `listInternalToolDescriptors(config)`; execution uses `executeSignalInternalTool(tool, input, ctx)` with input/output validation.

The **agent orchestrator** (`executeSignalToolRequest`) wraps that registry for typed envelopes and metering — see [agent-orchestrator-v1.md](agent-orchestrator-v1.md).

## Configuration (intel)

See `packages/config` / `services/intel/.env.example`: `SIGNAL_TOOL_INGEST_BASE_URL`, `SIGNAL_TOOL_INGEST_RUN_ONCE_SECRET`.
