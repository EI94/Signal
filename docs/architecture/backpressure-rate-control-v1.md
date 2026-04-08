# Backpressure and rate control (WS10.4 / v1)

Signal uses **small, explicit guardrails** tied to real pipeline steps. There is no distributed rate limiter, adaptive throttling, or resilience framework.

## Source fetch discipline (ingest)

**Metadata:** `checkFrequencyBucket` on each source (`hourly` | `every_6h` | `daily` | `weekly`).

**Rule:** Before `fetchUrlOnce`, ingest evaluates whether the HTTP fetch should be **deferred**:

- If `SIGNAL_INGEST_RATE_POLICY_ENABLED` is `false` → always fetch (when other preconditions pass).
- If `lastFetchedAt` is **absent** → **never** defer (first observation / backfill).
- If `lastFetchedAt` is present → defer when elapsed time is **strictly less** than the minimum interval for the bucket (see `minIntervalMsForBucket` in `services/ingest/src/lib/source-rate-policy.ts`).

**Outcome:** Deferred sources return `deltaOutcome: unsupported_or_skipped` with `reasonCode: rate_policy_deferred`. **`lastFetchedAt` is not updated** on deferral (deferral is not a successful fetch).

**Metering:** `IngestRunOnceSummary.skippedRatePolicy` counts deferrals; `skipped` includes them with other skips.

## Per-run source cap (ingest)

**Config:** `SIGNAL_INGEST_MAX_SOURCES_PER_RUN` (default `500`, minimum `1`).

**Rule:** For **full** run-once (no `sourceId` filter), the active source list is truncated to at most this many entries **in list order**. Single-source runs (`sourceId` set) **ignore** the cap.

**Summary fields:**

- `sourcesOmittedByCap` — how many sources were dropped by truncation.
- `maxSourcesPerRunApplied` — the cap value when truncation happened; `null` when single-source run or no truncation.

## Optional Perplexity enrichment (intel)

**Config:** `SIGNAL_BRIEF_MAX_ENRICHMENT_CALLS` (non-negative integer, default `1`).

**Rule:** Morning brief generation calls Perplexity for the executive block only if enrichment is enabled **and** `briefMaxEnrichmentCalls > 0`. Set to `0` to hard-disable enrichment calls regardless of feature flags.

## Email delivery (intel / Resend)

**Contract:** API schemas cap `to` at 20 recipients.

**Runtime:** `SIGNAL_EMAIL_MAX_RECIPIENTS_PER_REQUEST` (1–20, default `20`) rejects sends when `to.length` exceeds the configured cap, returning `status: skipped`, `skippedReason: recipient_cap_exceeded`. Defense in depth for internal callers that bypass HTTP validation.

## Intentionally deferred (later work)

- Scheduler/orchestrator replacing “run-once + policy” with true cadence per source.
- Global budget accounting beyond usage metering rows.
- UI or API for quota management.

## Environment variables (summary)

| Variable | Service | Purpose |
|----------|---------|---------|
| `SIGNAL_INGEST_RATE_POLICY_ENABLED` | ingest | Default `true`; set `false`/`0`/`no` to disable bucket-based fetch deferral |
| `SIGNAL_INGEST_MAX_SOURCES_PER_RUN` | ingest | Max sources per full run (default `500`) |
| `SIGNAL_BRIEF_MAX_ENRICHMENT_CALLS` | intel | Max Perplexity calls per brief path (`0` = off; default `1`) |
| `SIGNAL_EMAIL_MAX_RECIPIENTS_PER_REQUEST` | intel | Hard cap on `to.length` (default `20`) |
