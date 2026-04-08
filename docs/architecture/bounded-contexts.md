# Bounded Contexts

This document defines the bounded contexts of Signal, their ownership, responsibilities, boundaries, and interactions.

---

## 1. Ingestion Context

**Owner:** `services/ingest`

**Responsibility:** Fetch public/official sources on schedule, archive raw content, detect content changes.

**Inputs:**
- Cloud Scheduler triggers (per-source cadence configuration)
- Source registry (Firestore): URLs, fetch frequency, last content hash, last fetch timestamp
- Manual re-fetch requests via `apps/api` (forwarded as Cloud Tasks)

**Outputs:**
- Raw content snapshots → GCS (immutable, timestamped, content-hashed)
- Source state updates → Firestore (last hash, last fetch time, fetch status)
- `source.delta.detected` events → Pub/Sub (contains: contentId, sourceId, sourceType, gcsPath, contentHash, deltaType, detectedAt)
- `source.fetch.failed` events → Pub/Sub (for observability and circuit-breaker state)

**Storage Responsibilities:**
| Store | What | Access |
|---|---|---|
| GCS | Raw HTML/PDF/JSON snapshots, one object per fetch per source | Write on fetch |
| Firestore | `sources/{sourceId}` — registry, schedule config, fetch state, content hash | Read/write |

**APIs Crossing Boundaries:**
- Publishes: `source.delta.detected`, `source.fetch.failed` (Pub/Sub)
- Consumes: Cloud Scheduler triggers, Cloud Tasks for manual re-fetch
- Called by: `apps/api` for source management (CRUD on source registry)

**What Must NOT Live Here:**
- Content interpretation or normalization
- Signal scoring or relevance assessment
- User-facing state or preferences
- Alert rule evaluation
- Any LLM invocation

---

## 2. Intel Context

**Owner:** `services/intel`

**Responsibility:** Consume raw deltas, extract candidate ExtractedEvents, promote qualifying events into scored Signals, write read models, evaluate alert rules.

The Intel context implements the second and third layers of the canonical pipeline: **SourceContent → ExtractedEvent → Signal**. It does NOT produce signals directly from raw content. The intermediate ExtractedEvent layer provides deduplication, confidence gating, and provenance.

**Inputs:**
- `source.delta.detected` events from Pub/Sub (includes `contentId`, `gcsPath`)
- Raw content from GCS (fetched by reference from the event payload)
- Entity registry from Firestore (known competitors, clients, technologies, projects, commodities)
- Alert rules from Firestore (configured by users through `apps/api`)
- Scoring rules and heuristic configuration (Workspace-level weights)

**Outputs:**
- ExtractedEvents → BigQuery `extracted_events` table (permanent), Firestore `extracted_events/{eventId}` (7-day TTL for dedup)
- Scored Signals → Firestore `signals/{signalId}` (dashboard read model, 90-day TTL), BigQuery `signals` table (permanent)
- `signal.scored` events → Pub/Sub (for downstream consumers)
- `alert.triggered` events → Pub/Sub (when a signal matches an alert rule)
- Enrichment requests → LLM provider (only on escalation, never on default path)
- Processing errors → BigQuery `processing_errors` table

**Storage Responsibilities:**
| Store | What | Access |
|---|---|---|
| Firestore | `extracted_events/{eventId}` — active processing window (7-day TTL, for dedup) | Write after extraction |
| Firestore | `signals/{signalId}` — scored signals (dashboard read model, 90-day TTL) | Write after scoring |
| Firestore | `entities/{entityId}` — entity registry | Read for entity resolution |
| Firestore | `alert_rules/{ruleId}` — active alert rules | Read for evaluation |
| BigQuery | `extracted_events` table — full extraction history | Append after extraction |
| BigQuery | `signals` table — full signal history | Append after scoring |
| BigQuery | `enrichments` table — LLM enrichment call log | Append on enrichment |
| BigQuery | `processing_errors` table — extraction/scoring failures | Append on error |

**APIs Crossing Boundaries:**
- Consumes: `source.delta.detected` (Pub/Sub)
- Publishes: `signal.scored`, `alert.triggered` (Pub/Sub)
- Reads: GCS (raw content by reference), Firestore (entity registry, alert rules, existing events/signals for dedup)
- Does NOT expose HTTP APIs; it is a pure event-driven processor

**What Must NOT Live Here:**
- Source fetching or scheduling
- Raw content archiving
- User authentication or session management
- Dashboard read-model shaping (the Firestore write IS the read model)
- Email/notification delivery
- Brief composition

---

## 3. Serving Context

**Owner:** `apps/api`

**Responsibility:** Expose typed HTTP APIs for the dashboard and external consumers. Authenticate requests. Compose read models. Manage user-facing configuration.

**Inputs:**
- HTTP requests from `apps/web` (authenticated via Firebase Auth tokens)
- Firestore read models (signals, entities, user config, alert rules)
- BigQuery (for analytical/trend queries)

**Outputs:**
- JSON API responses conforming to `packages/contracts` schemas
- Firestore writes for user preferences, alert rule CRUD, entity management
- Cloud Tasks for triggering manual re-fetches in Ingestion context

**Storage Responsibilities:**
| Store | What | Access |
|---|---|---|
| Firestore | Read: signals, entities, alert rules, user config | Read |
| Firestore | Write: user preferences, alert rules, entity CRUD | Write |
| BigQuery | Analytical queries: signal trends, source health, scoring distributions | Read (query) |

**APIs Crossing Boundaries:**
- Exposes: REST/JSON endpoints for dashboard, user management, entity management, alert configuration, analytics
- Calls: Firestore (direct client), BigQuery (query client)
- Publishes: Cloud Tasks for manual operations (re-fetch, re-score)
- Does NOT consume Pub/Sub events directly

**What Must NOT Live Here:**
- Source fetching or raw content processing
- Delta detection or normalization
- Signal scoring logic
- Email sending
- LLM invocation for enrichment (agent orchestration initiates here but execution is delegated)
- Direct Pub/Sub event publishing for pipeline events

---

## 4. Alerting Context

**Owner:** Alert worker (deployed as part of `services/intel` or as a dedicated Cloud Run service)

**Responsibility:** Consume `alert.triggered` events and deliver notifications.

**Inputs:**
- `alert.triggered` events from Pub/Sub (contains: signal ID, matched rule ID, recipient info)
- Alert rule definitions from Firestore (for rendering context)
- Signal data from Firestore (for email body composition)

**Outputs:**
- Email notifications via Resend
- Webhook deliveries (future)
- Delivery log → Firestore `alert_deliveries/{deliveryId}`

**Storage Responsibilities:**
| Store | What | Access |
|---|---|---|
| Firestore | `alert_deliveries/{deliveryId}` — delivery status, timestamp, recipient | Write |
| Firestore | `alert_rules/{ruleId}` — rule definitions (read for rendering) | Read |

**APIs Crossing Boundaries:**
- Consumes: `alert.triggered` (Pub/Sub)
- Calls: Resend API (email delivery)
- Reads: Firestore (signal data, alert rules for template rendering)

**What Must NOT Live Here:**
- Alert rule evaluation (that's Intel's job)
- Signal scoring
- User CRUD
- Dashboard data shaping

---

## 5. Briefing Context

**Owner:** Brief worker (Cloud Run job triggered by Cloud Scheduler)

**Responsibility:** Generate daily intelligence briefs from current signal state and deliver via email.

**Inputs:**
- Cloud Scheduler trigger (daily, configurable time)
- Firestore read models: top signals by score, entity activity summaries
- User brief preferences from Firestore (recipients, scope, format)

**Outputs:**
- Composed brief (structured content) → Resend (email delivery)
- Brief archive → Firestore `briefs/{briefId}` (for dashboard access to past briefs)
- Optionally: LLM-generated executive summary (escalation path, not default)

**Storage Responsibilities:**
| Store | What | Access |
|---|---|---|
| Firestore | `briefs/{briefId}` — archived briefs, generation metadata | Write |
| Firestore | Read: signals, entities, user preferences | Read |

**APIs Crossing Boundaries:**
- Triggered by: Cloud Scheduler
- Calls: Resend API
- Reads: Firestore (signals, entities, user config)

**What Must NOT Live Here:**
- Signal processing or scoring
- Source fetching
- Alert rule management
- Real-time dashboard serving

---

## 6. Identity Context

**Owner:** Firebase Auth + `apps/api` (user profile/preference management)

**Responsibility:** Authenticate users, manage organization membership, store user preferences.

**Inputs:**
- Firebase Auth tokens (from frontend)
- User preference updates (from dashboard via `apps/api`)

**Outputs:**
- Authenticated user identity (UID, email, roles)
- User preferences persisted in Firestore

**Storage Responsibilities:**
| Store | What | Access |
|---|---|---|
| Firebase Auth | User credentials, email, auth providers | Managed by Firebase |
| Firestore | `users/{userId}` — preferences, theme, brief config, role | Read/write via API |

**APIs Crossing Boundaries:**
- Firebase Auth SDK used by `apps/web` for login flows
- Firebase Auth Admin SDK used by `apps/api` for token verification
- `apps/api` exposes preference management endpoints

**What Must NOT Live Here:**
- Business logic
- Signal processing
- Source management
- Authorization policy engine (MVP uses simple role checks in API middleware; a dedicated authz service is post-MVP)

---

## 7. Agent Context

**Owner:** Agent orchestrator within `apps/api` (dedicated module, not a separate service for MVP)

**Responsibility:** Expose a function-calling interface for agentic interactions. Register available tools. Orchestrate tool execution. Return structured results.

**Inputs:**
- User queries via agent endpoint in `apps/api`
- Tool registry (code-defined, schema-first)
- Current signal state from Firestore
- External providers (Perplexity for enrichment/escalation, other LLM providers)

**Outputs:**
- Structured tool call results (JSON, conforming to `packages/contracts`)
- Execution log → Firestore `agent_executions/{executionId}`

**Storage Responsibilities:**
| Store | What | Access |
|---|---|---|
| Firestore | `agent_executions/{executionId}` — call log, tool used, result summary | Write |
| Firestore | Tool registry metadata (if dynamic registration is needed; otherwise code-defined) | Read |

**APIs Crossing Boundaries:**
- Exposes: Agent endpoint in `apps/api`
- Calls: Internal tool functions (query signals, get entity detail, trigger re-fetch, etc.)
- Calls: External LLM providers for function-calling orchestration
- Calls: Perplexity API for enrichment/escalation

**What Must NOT Live Here:**
- Direct signal processing or scoring
- Source fetching
- Alert rule evaluation
- Brief generation
- Hardcoded provider dependencies (all LLM interaction is behind a provider-agnostic interface)

---

## Context Interaction Map

```
                    Cloud Scheduler
                         │
              ┌──────────┴──────────┐
              ▼                      ▼
        ┌───────────┐         ┌───────────┐
        │ Ingestion │         │ Briefing  │
        └─────┬─────┘         └─────┬─────┘
              │                      │
         GCS + Pub/Sub          Reads Firestore
              │                      │
              ▼                      ▼
        ┌───────────┐            Resend
        │   Intel   │
        └──┬────┬───┘
           │    │
    Firestore  BigQuery
    (signals)  (history)
           │    │
           ▼    │
     ┌──────────┴──┐     ┌───────────┐
     │   Serving   │◀────│ Identity  │
     │  (apps/api) │     └───────────┘
     └──────┬──────┘
            │
       ┌────┴────┐
       ▼         ▼
  ┌────────┐ ┌───────┐
  │  Web   │ │ Agent │
  │(dashboard)│(tools)│
  └────────┘ └───────┘
```

---

## Cross-Context Rules

1. **No context may read another context's internal Firestore collections directly.** If Context A needs data owned by Context B, Context B must expose it through a Pub/Sub event or an API endpoint.
   - Exception: The Serving context reads Firestore collections written by Intel (signals read model). This is intentional — Intel writes the read model specifically for Serving to consume. The schema is defined in `packages/contracts`.

2. **All cross-context data shapes are defined in `packages/contracts`.** No service may invent ad-hoc wire formats.

3. **Pub/Sub topics are named by domain and event type.** Pattern: `{domain}.{event}` — e.g., `source.delta.detected`, `source.fetch.failed`, `signal.scored`, `alert.triggered`. The producing context is implicit from the domain name. Dead-letter topics append `.dlq` (e.g., `source.delta.detected.dlq`).

4. **No circular dependencies between contexts.** The dependency graph is a DAG: Ingestion → Intel → Serving/Alerting/Briefing. Agent calls into Serving but does not feed back into Intel.
