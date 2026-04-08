# North Star Architecture

## System Purpose

Signal is an enterprise intelligence platform that transforms publicly available information into actionable business signals for board members and BI teams in a large industrial energy group.

The system monitors competitors, clients, technologies, projects, commodities, and annual reporting across official/public sources. It detects meaningful changes, extracts candidate events, promotes qualifying events into scored signals, and delivers them through a command-center dashboard, daily briefs, and configurable alerts. The canonical pipeline is: **SourceContent → ExtractedEvent → Signal**. See [Canonical Ontology](canonical-ontology.md) for definitions.

Signal is NOT a general-purpose search engine, a social media monitor, or a news aggregator. It is a structured intelligence pipeline with a defined scope of sources and a curated set of business entities.

## Architectural Principles

### 1. Contract-First, Schema-First

Every data shape that crosses a service boundary is defined as a Zod schema in `packages/contracts`. These schemas generate TypeScript types, OpenAPI specs, and validation logic. No service may invent its own wire format for cross-boundary communication.

### 2. Delta Processing Over Full Rescans

The ingestion pipeline tracks source state and only processes changes. Full rescans are a recovery mechanism, not the default operating mode. This controls cost, reduces noise, and makes the system's behavior predictable.

### 3. Storage Role Separation

| Store | Role | Access Pattern |
|---|---|---|
| Google Cloud Storage | Raw source archive, provenance, immutable snapshots | Write on ingest, read on reprocessing or audit |
| Firestore | Operational state: current signals, user config, alert rules, read models | Real-time reads/writes from API layer |
| BigQuery | Historical analytics, trend computation, audit trail | Batch writes from pipeline, analytical queries from API |

These roles do not overlap. Firestore is not a data warehouse. BigQuery is not a real-time backend. GCS is not a database.

### 4. Explicit Backend Read Models

The frontend (`apps/web`) never queries Firestore or BigQuery directly. All product data reads flow through `apps/api`, which exposes purpose-built read endpoints. This decouples the frontend from storage implementation and allows the API to compose data from multiple sources behind a stable contract.

### 5. LLM as Escalation, Not Default

The default ingestion and processing path is deterministic: fetch, diff, parse, normalize, score using rules and heuristics. LLMs are invoked only when:
- Deterministic extraction fails or returns low confidence
- The signal requires semantic interpretation beyond structured parsing
- A user explicitly requests AI-assisted analysis (e.g., through the agent layer)

This controls cost, ensures reproducibility, and avoids coupling the pipeline's correctness to model availability.

### 6. Async Writes, Sync Reads

All write-path operations (ingestion, delta detection, normalization, scoring, alert evaluation, brief generation) are asynchronous, orchestrated through Pub/Sub and Cloud Tasks. Read-path operations (dashboard queries, user config, alert management) are synchronous through the Fastify API.

### 7. Staged Deployability

The system is designed so that each bounded context can be deployed and validated independently. The MVP ships in stages:
1. Ingestion + archive (sources flowing, deltas detected)
2. Intel + read model (signals scored, served to API)
3. Dashboard (command center live)
4. Alerts + briefs (notifications flowing)
5. Agent layer (function calling enabled)

No stage requires the next stage to be operational.

## Bounded Contexts

| Context | Deployed As | Primary Storage | Async/Sync |
|---|---|---|---|
| Ingestion | `services/ingest` (Cloud Run) | GCS (archive), Firestore (source state) | Async (Pub/Sub, Cloud Scheduler) |
| Intel | `services/intel` (Cloud Run) | Firestore (signals, read models), BigQuery (history) | Async (Pub/Sub) |
| Serving | `apps/api` (Cloud Run) | Reads from Firestore, BigQuery | Sync (HTTP) |
| Alerting | Within `services/intel` or dedicated worker | Firestore (alert rules, delivery log) | Async (Pub/Sub) |
| Briefing | Scheduled worker (Cloud Tasks) | Reads from Firestore read models | Async (Cloud Scheduler) |
| Identity | `apps/api` + Firebase Auth | Firestore (user preferences, org config) | Sync (HTTP) |
| Agent | `apps/api` + dedicated orchestrator | Firestore (tool registry, execution log) | Sync request, async execution |

See [Bounded Contexts](bounded-contexts.md) for detailed ownership, inputs/outputs, and exclusions.

## Service Responsibilities

### `apps/web` — Dashboard Frontend
- Server-rendered Next.js application
- Consumes `apps/api` exclusively
- Owns UI state, layout, theme (dark mode default, light selectable)
- Does NOT contain business logic, data transformation, or direct storage access

### `apps/api` — Backend API
- Fastify server on Cloud Run
- Authenticates requests via Firebase Auth tokens
- Serves read models from Firestore (and occasionally BigQuery for analytics views)
- Exposes management endpoints for user preferences, alert rules, entity configuration
- Hosts the agent/function-calling orchestration entry point
- Does NOT run ingestion or intel processing

### `services/ingest` — Ingestion Service
- Fetches sources on schedule (Cloud Scheduler triggers)
- Archives raw content to GCS with timestamp and content hash
- Computes deltas against previous snapshots
- Publishes `source.delta.detected` events to Pub/Sub
- Maintains source registry and fetch state in Firestore
- Does NOT normalize, score, or interpret content

### `services/intel` — Intelligence Service
- Consumes `source.delta.detected` events
- Parses raw content, extracts candidate **ExtractedEvents** with confidence and entity resolution
- Promotes qualifying events (confidence ≥ 30, entity resolved) into scored **Signals**
- Scores signals on 5 dimensions (relevance, impact, freshness, confidence, sourceAuthority) — integer 0–100
- Writes ExtractedEvents to BigQuery (permanent) and Firestore (7-day TTL for dedup)
- Writes scored Signals to Firestore read model and BigQuery history
- Evaluates alert rules against new signals
- Publishes `signal.scored` and `alert.triggered` events
- Does NOT fetch sources or manage user-facing state

### `packages/contracts` — Shared Contracts
- Zod schemas for all cross-boundary data shapes
- OpenAPI spec generation
- TypeScript type exports
- Event envelope schemas (Pub/Sub message formats)
- Does NOT contain business logic or runtime code

## Sync vs Async Boundaries

```
┌─────────────────────────────────────────────────────┐
│                    SYNC BOUNDARY                     │
│                                                      │
│  Browser ──HTTP──▶ apps/api ──read──▶ Firestore     │
│                         │                            │
│                         ├──read──▶ BigQuery (analytics)
│                         │                            │
│                         └──write──▶ Firestore (config)
│                                                      │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                   ASYNC BOUNDARY                     │
│                                                      │
│  Cloud Scheduler ──▶ services/ingest                 │
│       │                    │                         │
│       │              GCS (archive)                   │
│       │                    │                         │
│       │              Pub/Sub: source.delta.detected   │
│       │                    │                         │
│       │              services/intel                   │
│       │                    │                         │
│       │              ┌─────┴──────┐                  │
│       │         Firestore    BigQuery                │
│       │         (read model) (history)               │
│       │              │                               │
│       │         Pub/Sub: signal.scored                │
│       │         Pub/Sub: alert.triggered              │
│       │              │                               │
│       │         Alert worker ──▶ Resend              │
│       │                                              │
│  Cloud Scheduler ──▶ Brief worker ──▶ Resend         │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Data Flow Summary

1. **Cloud Scheduler** triggers `services/ingest` on a per-source cadence
2. **Ingest** fetches the source, archives raw content to **GCS**, creates **SourceContent** metadata, computes delta
3. If delta detected → publishes `source.delta.detected` to **Pub/Sub** (payload includes `contentId`)
4. **Intel** consumes the event, parses raw content from GCS, resolves entities, extracts **ExtractedEvent(s)** with confidence scores
5. **Intel** promotes qualifying events (confidence ≥ 30, entities resolved) into **Signals**, scoring on 5 dimensions (0–100 integer scale)
6. ExtractedEvents written to **BigQuery** (permanent) and **Firestore** (7-day TTL for dedup)
7. Scored Signals written to **Firestore** (dashboard read model, 90-day TTL) and **BigQuery** (permanent history)
8. **Intel** evaluates alert rules against new signals; if triggered → publishes `alert.triggered`
9. **Alert worker** sends notifications via **Resend** (email for MVP)
10. **Cloud Scheduler** triggers daily brief generation; brief worker reads Firestore read models, composes brief, sends via **Resend**
11. **Dashboard** reads signals, entities, and config through `apps/api` which queries Firestore (operational) and BigQuery (analytics)

See [Data Flow v2](data-flow-v2.md) for detailed flow diagrams and failure handling.

## Cost-Control Principles

1. **Delta-only processing** — Don't reprocess unchanged sources. Content-hash comparisons before any downstream work.
2. **LLM gating** — LLM calls only on escalation. Track per-signal cost attribution. Set hard monthly budgets with circuit breakers.
3. **BigQuery partitioning** — Partition by ingestion date. Set table expiry policies for raw event data. Use materialized views for dashboard-backing queries.
4. **Cloud Run scaling** — Min instances = 0 for `services/ingest` and `services/intel` (they are event-driven). `apps/api` keeps min instances = 1 for latency.
5. **GCS lifecycle** — Archive tier for raw snapshots older than 90 days. Never delete (provenance requirement), but tier down.
6. **Pub/Sub dead-letter** — Failed messages go to dead-letter topics, not infinite retries. Human review before replay.

## Reliability Principles

1. **Idempotent processing** — Every pipeline stage must be safe to retry. Deterministic IDs (content hashes for SourceContent, semantic hashes for ExtractedEvent and Signal) serve as deduplication keys.
2. **At-least-once delivery** — Pub/Sub guarantees at-least-once. All consumers must handle duplicates.
3. **Graceful degradation** — If Intel is down, Ingest still archives to GCS. If alerts fail, signals are still visible in the dashboard. If LLM provider is unavailable, deterministic scoring continues.
4. **Observability** — Structured JSON logging on every service. Correlation IDs from ingest through alert delivery. Error budgets per bounded context.
5. **Circuit breakers** — External source fetches and LLM calls use circuit breakers with exponential backoff.

## Anti-Technical-Debt Rules

1. **No shared mutable state between services.** Services communicate through contracts (Pub/Sub events, HTTP APIs). No direct database sharing across bounded contexts.
2. **No "temporary" abstractions.** If a pattern isn't justified by two concrete consumers, it doesn't get an abstraction. Extract when the duplication is proven, not speculated.
3. **No feature flags in contracts.** Contracts are versioned and stable. Feature variation lives in service-internal logic.
4. **No ORM.** Firestore and BigQuery clients are used directly with typed wrappers generated from Zod schemas. ORMs add indirection without value for document stores.
5. **No God services.** If a service handles more than one bounded context, split it before adding the next feature.
6. **No silent failures.** Every error is logged with context. Every async failure is dead-lettered. Every API error returns a structured error response.
7. **Dependency hygiene.** Every `package.json` declares only what it imports. No transitive dependency assumptions. `packages/contracts` has zero runtime dependencies beyond Zod.

## Non-Goals for MVP

The following are explicitly out of scope for MVP:
- **Real-time streaming to dashboard** — Polling or short-interval refresh is sufficient. WebSocket/SSE can be added later.
- **Multi-tenant isolation** — MVP serves a single organization. Multi-tenancy is a future concern.
- **Custom source connectors** — MVP uses a fixed set of source types. A plugin system for custom connectors is post-MVP.
- **Full-text search** — Structured signal queries are sufficient. Elasticsearch/Typesense integration is post-MVP.
- **Mobile app** — Responsive web is the only client for MVP.
- **Workflow builder UI** — Alert rules are configured through a simple form, not a visual workflow editor.
- **MCP server implementation** — The architecture anticipates MCP integration points, but no MCP server is built for MVP. The agent layer uses direct function calling.
- **Self-hosted deployment** — MVP runs on GCP only. On-premise packaging is post-MVP.
