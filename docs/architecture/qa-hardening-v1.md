# QA hardening v1 (WS10.3)

Focused **regression resistance** on the real critical path: contracts, a few **integration-style** compositions with mocked I/O, **API route smoke** (Fastify inject), and **web ↔ contract** shape checks. Not a full E2E suite; not coverage-driven theater.

## What was strengthened

| Layer | Intent |
|-------|--------|
| **Contracts** | `critical-path-wire-compatibility.test.ts` — HealthSummary, usage metering row, tool execution, alert evaluation response, email delivery response (wire shapes that cross services). |
| **Ingest** | `run-once.composition.test.ts` — `runOnceIngestCycle` with mocked registry, `processOneSource`, archive, publish, metering; asserts counters on a happy path. |
| **API** | `serving-v1.smoke.test.ts` — auth + workspace mocked; GET board/signals/entities/map/notifications return 200 and parseable JSON. `health-internal.smoke.test.ts` — internal health summary path. |
| **Web** | `contract-shapes.test.ts` — fixtures still `safeParse` against serving schemas (board, feed, entity, map, notifications). |

Existing unit tests (read-models, intel/ingest libs, `api-serving-v1.test.ts`, etc.) remain the bulk of coverage; this epic **adds boundary confidence**, not duplicate leaf tests.

## Intentionally not covered here

- Browser automation / Playwright for every page.
- Load/performance testing.
- Full Firestore/BigQuery emulators in CI.
- 100% coverage or golden-file dumps of large payloads.

## CI

No workflow change: `pnpm check` (typecheck + lint + test) remains the gate; new tests run under existing `pnpm test`.

## Follow-up (WS10.4+)

- Optional narrow Playwright smoke (login + one dashboard read) if product needs it; keep behind a separate job or manual trigger if flaky.
