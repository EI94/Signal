# Morning brief (WS9.2) — v1

Deterministic, template-first morning briefs derived from **`signalsLatest` only**. No mandatory LLM: optional Perplexity enrichment tightens a single **Executive summary** block when explicitly enabled.

## Brief types

| Type | Role | Selection (see code) |
|------|------|-------------------------|
| `daily_workspace` | Broader daily snapshot | Lower score floor, higher caps |
| `board_digest` | Shorter leadership view | Higher score floor, stricter caps |

Constants: `BRIEF_SELECTION` in `services/intel/src/lib/select-brief-signals.ts`.

## Time window (explicit)

For reporting day `P` (UTC `YYYY-MM-DD` from `periodDate` or “today” UTC):

1. `periodStart` / `periodEnd` = full UTC calendar day for `P`.
2. **Effective signal window** = intersection of `[periodStart, periodEnd]` and `[now − lookbackHours, now]`.
3. Signals outside that window are excluded before scoring thresholds.

`lookbackHours` = `SIGNAL_BRIEF_LOOKBACK_HOURS` (default **48**).

## Sections (grounded)

Markdown sections:

- **Executive summary** — only if optional enrichment produced text (or omitted).
- **Top signals** — highest scores in the selected set (capped per variant).
- **Competitor-linked** / **Client-linked** / **Markets & regions** — `entityRefs` match `competitor`, `client`, `geography` respectively; empty sections state that honestly.

No commodity or “insight” prose without data. Alerts are **not** summarized here (Epic 9.2 scope); reuse the alert engine elsewhere if needed.

## Optional enrichment

When **all** hold:

- `SIGNAL_BRIEF_ENRICHMENT_ENABLED=true`
- `SIGNAL_PERPLEXITY_ENABLED=true` and API key present
- `deps.enrichExecutive` resolves (default: `callPerplexitySummarizeDelta`)

…a bounded list of real signal lines is passed to the existing **`summarize_delta`** contract. Failure or absence of enrichment **never** blocks generation; the deterministic body always ships.

## Persistence

| Store | Role |
|-------|------|
| **GCS** (raw bucket) | Full markdown body at deterministic key `briefs/workspace_id=…/date=YYYY-MM-DD/{briefId}.md` |
| **Firestore** `workspaces/{id}/briefs/{briefId}` | Metadata (`briefType`, optional `title`, `periodStart`/`periodEnd`, `status`, `summaryRef`, timestamps) — not a content warehouse |
| **BigQuery** `brief_runs` | Analytical run row: ids, type, **DATE** `period_start`/`period_end`, `source_signal_ids`, `generated_at`, `model_assisted`, etc. |

## Runtime flags

| Variable | Default | Meaning |
|----------|---------|---------|
| `SIGNAL_BRIEF_GENERATION_ENABLED` | off | Gates `POST /internal/generate-brief` and `generate_brief` tool |
| `SIGNAL_BRIEF_LOOKBACK_HOURS` | 48 | Lookback within the reporting day |
| `SIGNAL_BRIEF_ENRICHMENT_ENABLED` | off | Allows optional executive enrichment (still needs Perplexity) |
| `SIGNAL_BIGQUERY_BRIEF_RUNS_TABLE` | `brief_runs` | BQ table id for run metadata |

## Intentionally deferred (post WS9.3)

- Push delivery (email: see `email-delivery-v1.md`)
- Notification center UI
- Brief history UX beyond BQ + metadata
- Rich HTML renderer
- Broad personalization / CMS

## Execution surface

- `POST /internal/generate-brief` (services/intel, same secret header pattern as other internal routes when configured).
- Internal tool `generate_brief` with input `GenerateMorningBriefRequestSchema`.
