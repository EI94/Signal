# Health & SLO foundation v1 (WS10.2)

Small **operational** layer: process liveness, readiness (dependencies), and **data freshness / staleness** grounded in Firestore + optional BigQuery `usage_events`. Not a monitoring product, no vendor integrations, no dashboards.

## Surfaces

| Surface | Location | Role |
|--------|----------|------|
| Liveness | `GET /healthz` on api, ingest, intel | Process responds; no dependency checks. |
| Readiness | `GET /readiness` on api, ingest, intel | **Firestore connectivity** (cheap read). HTTP **503** + `status: unhealthy` on failure (api also reads default workspace doc). |
| Pipeline summary | `GET /internal/health/summary` on **apps/api** | Structured freshness + stale flags + optional usage_events timestamps. |

## Readiness vs liveness

- **Liveness** — the Node process can handle HTTP.
- **Readiness** — the service can reach Firestore (required for Signal’s operational stores).
- **Health summary** — product/pipeline **freshness** (signals, briefs, ingest runs, promote/brief/alert activity from metering when available). These are intentionally **not** collapsed into a single boolean.

## `GET /internal/health/summary`

- **Contract:** `HealthSummaryV1` in `packages/contracts/src/health-slo.ts`.
- **Auth:** optional `SIGNAL_INTERNAL_HEALTH_SECRET`; when set, send header `x-signal-internal-health-secret`. When unset (typical local dev), the route is open — **do not expose publicly** without a secret or network controls.
- **Firestore:** latest `detectedAt` in `signalsLatest` (max 1 doc), latest `updatedAt` in `briefs` (max 1 doc), plus readiness-style workspace read.
- **BigQuery:** if `SIGNAL_BIGQUERY_DATASET` is set for the API **and** ADC can build a client, queries **`usage_events`** for last **ok** `occurred_at` per event type: `ingest.run.complete`, `intel.promote.complete`, `intel.brief.generate.complete`, `intel.alerts.evaluate.complete`. Scan is **bounded** by `SIGNAL_HEALTH_USAGE_LOOKBACK_HOURS` (default 168h).

If metering was never enabled, those timestamps may be null → **stale** flags reflect “no successful row seen in window,” not a false “healthy.”

## Stale thresholds (configurable)

| Env | Default | Applies to |
|-----|---------|------------|
| `SIGNAL_HEALTH_STALE_SIGNALS_HOURS` | 48 | Firestore `signalsLatest` max `detectedAt` |
| `SIGNAL_HEALTH_STALE_INGEST_HOURS` | 24 | Last ok `ingest.run.complete` in `usage_events` |
| `SIGNAL_HEALTH_STALE_BRIEF_HOURS` | 72 | Firestore `briefs` max `updatedAt` |

Missing timestamp in scope → **stale** (conservative).

## Intentionally not covered (v1)

- Per-route SLO percentages or error budgets.
- Synthetic probes, paging, Grafana/Datadog.
- Exactly-once semantics for “last event” (BigQuery streaming + retries).
- Intel/ingest-specific JSON health summaries (use their `/readiness` + API summary for pipeline view).

## Follow-up (WS10.3+)

- Optional alerting on stale flags; materialized rollups if `usage_events` volume grows; stricter auth for internal routes behind IAP/VPC.
