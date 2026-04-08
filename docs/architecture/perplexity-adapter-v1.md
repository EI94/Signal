# Perplexity adapter (WS5.5)

**Enrichment and escalation only.** Perplexity does not replace deterministic ingestion, extraction, or signal promotion/scoring. Those paths never call this adapter.

## Position in the stack

1. **Deterministic pipeline** (ingest → SourceContent → extract → promote/score) — unchanged.
2. **Internal tool registry** — exposes tools with strict contracts.
3. **Agent orchestrator** — validates envelopes and delegates to the registry (no provider logic).
4. **Perplexity** — used only when a specific tool implementation calls `callPerplexitySummarizeDelta` in `services/intel`.

## What uses Perplexity today

| Tool | Behavior |
|------|----------|
| `summarize_delta` | When `SIGNAL_PERPLEXITY_ENABLED=true` and `SIGNAL_PERPLEXITY_API_KEY` are set at **load time**, the tool is **implemented**: it sends a bounded prompt derived from `SummarizeDeltaToolInput` and returns `SummarizeDeltaToolOutput` (Zod-validated). |
| `generate_brief`, `evaluate_alerts` | Still **not_implemented** — no adapter calls. |

Listing: `summarize_delta` is `requires_configuration` until Perplexity is enabled; execution without config returns **`unavailable`** with an explicit message.

## Runtime configuration (intel)

| Variable | Default | Notes |
|----------|---------|--------|
| `SIGNAL_PERPLEXITY_ENABLED` | off | Must be `true`/`1`/`yes` to enable. |
| `SIGNAL_PERPLEXITY_API_KEY` | — | **Required** when enabled; loader throws if missing. |
| `SIGNAL_PERPLEXITY_BASE_URL` | `https://api.perplexity.ai` | Trailing slashes stripped. |
| `SIGNAL_PERPLEXITY_MODEL` | `sonar` | Overridable. |
| `SIGNAL_PERPLEXITY_TIMEOUT_MS` | `45000` | Abort + `perplexity_timeout` on breach. |

Secrets stay server-side (`@signal/config`); never expose keys to the browser.

## Failure semantics

Provider failures map to tool **`execution`** errors with stable codes (`perplexity_http_*`, `perplexity_timeout`, `perplexity_output_schema_mismatch`, etc.). Raw provider bodies are not exposed as the primary contract; optional `details` may include truncated diagnostics for operators.

## What this is not

- No multi-provider abstraction layer.
- No prompt library or autonomous planning.
- No always-on calls in the mandatory pipeline.
- No replacement for deterministic scoring or extraction.

Future provider-specific work (e.g. other APIs) should add **separate** adapters and wire **explicit** tools — not generic routing inside the orchestrator.
