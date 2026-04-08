# ADR-0001: Monorepo and Service Boundaries

**Status:** Accepted
**Date:** 2026-04-04
**Authors:** Architecture Team

---

## Context

Signal is an enterprise intelligence platform with multiple deployment targets:

- A Next.js frontend dashboard (`apps/web`)
- A Fastify API server (`apps/api`)
- Two background processing services (`services/ingest`, `services/intel`)
- Shared contracts, UI components, and configuration

The team needs to decide:
1. How to organize the codebase — monorepo vs multi-repo
2. How to define service boundaries — monolith vs microservices vs bounded services
3. How to assign storage responsibilities across GCS, Firestore, and BigQuery

---

## Decision

### Monorepo with pnpm + Turborepo

All code lives in a single repository, organized into workspaces:

```
apps/web          # Next.js dashboard
apps/api          # Fastify API
services/ingest   # Source ingestion
services/intel    # Intelligence processing
packages/contracts  # Shared Zod schemas and types
packages/ui       # Design system
packages/config   # Shared build/lint config
packages/tooling  # Build scripts, codegen
```

### Bounded Services (Not Microservices)

Services are split by bounded context, not by arbitrary technical layers. Each service:
- Has a single, well-defined responsibility
- Owns its storage writes
- Communicates with other services through contracts (Pub/Sub events, HTTP APIs)
- Is independently deployable on Cloud Run

This is NOT a microservices architecture. We have four deployable units (web, api, ingest, intel), not dozens. The goal is clear ownership and independent deployability, not "one service per function."

### Storage Role Separation

| Store | Role | Why This Store |
|---|---|---|
| Google Cloud Storage | Raw source archive, provenance | Immutable object storage is the correct primitive for archiving fetched content. Cheap, durable, versioned. No query needed — content is retrieved by known path. |
| Firestore | Operational state, read models, user config | Low-latency document reads for dashboard serving. Real-time listeners (future). Flexible schema for evolving signal structures. Scales without provisioning. |
| BigQuery | Historical analytics, trend analysis, audit trail | Columnar analytics engine for time-series queries, aggregations, and reporting. Not suited for real-time reads but unmatched for analytical workloads at scale. Cost-effective for append-heavy write patterns. |

---

## Consequences

### Benefits

1. **Shared contracts are guaranteed consistent.** A schema change in `packages/contracts` triggers type-checking in every consumer in the same CI run. In a multi-repo setup, contract drift is a constant risk.

2. **Atomic cross-cutting changes.** When a Pub/Sub event schema changes, the producer (ingest) and consumer (intel) are updated in the same commit. No coordination across repos needed.

3. **Single CI pipeline.** Turborepo's caching means unchanged packages don't rebuild. The cost of a monorepo CI is comparable to multi-repo CIs, with better correctness guarantees.

4. **Onboarding simplicity.** A new developer clones one repo and can navigate the entire system. Service boundaries are visible in the directory structure.

5. **Storage clarity.** Each store has a distinct purpose. There's no ambiguity about "should this go in Firestore or BigQuery?" — the decision matrix is clear:
   - Need it for dashboard reads? → Firestore
   - Need it for historical analysis? → BigQuery
   - Need the raw source content? → GCS

### Tradeoffs

1. **CI complexity increases with repo size.** Turborepo caching mitigates this, but eventual CI slowdowns are possible. Mitigation: aggressive caching, affected-package-only test runs.

2. **Deployment coupling risk.** A bad commit to `packages/contracts` can break all consumers. Mitigation: strict CI (typecheck + test across all dependents before merge), contract versioning.

3. **Repository permissions are coarse.** All developers can see all code. This is acceptable for an enterprise team building a single product. If different teams with different access needs emerge, revisit.

4. **Firestore is not free at scale.** Document reads are priced per read. For a dashboard with high read volume, this is more expensive than a self-managed database. Mitigation: API-level caching (in-memory or CDN), read model design that minimizes document count per page load.

---

## Alternatives Considered

### Multi-Repo (FE + BE + Services Separate)

**Rejected because:**
- Contract drift between frontend and backend is the #1 source of bugs in enterprise platforms. A monorepo eliminates this class of bugs.
- The team is small enough that multi-repo coordination overhead is pure waste.
- Services share Zod schemas extensively. Keeping these in sync across repos requires either a published npm package (slow feedback loop) or git submodules (operational complexity).
- Deployment independence is achieved through Turborepo's per-package builds, not through repo separation.

### Single Monolith (One Deployable)

**Rejected because:**
- Ingestion and intel processing are background jobs triggered by Pub/Sub and Cloud Scheduler. They have fundamentally different scaling characteristics than the API server.
- A monolith would require the API server to also run background processing, which complicates scaling, deployment, and failure isolation.
- Cloud Run allows different concurrency, memory, and timeout settings per service. A monolith can't take advantage of this.

### Separate Databases Per Service

**Rejected because:**
- The Intel context writes read models that the Serving context reads. A separate database would require either data replication or an API call for every dashboard read, both of which add latency and complexity.
- Firestore is the right store for both "write signal read models" (Intel) and "read signal read models" (Serving). Using two Firestore projects for isolation would be overengineering.
- The cross-context read is explicitly documented and schema-controlled through `packages/contracts`. This is a conscious architectural decision, not an accidental coupling.

---

## Why Firestore + BigQuery + GCS Each Have Distinct Roles

This is worth calling out explicitly because the temptation to "just use Firestore for everything" is strong.

### GCS is not negotiable for raw content

Raw source content (HTML pages, PDFs, API responses) must be archived immutably for:
- **Provenance:** Proving what was seen and when.
- **Reprocessing:** If normalization logic changes, we replay from GCS, not from Firestore.
- **Legal/compliance:** Audit trail of source data.

Firestore is wrong for this: storing multi-MB documents in Firestore is expensive and fights the document-size limit (1 MB). GCS is purpose-built for object storage.

### BigQuery is not negotiable for analytics

Analytical queries like "How many signals about Competitor X scored above 80 in Q3?" require scanning millions of rows with aggregation. Firestore cannot do this efficiently (no aggregation queries beyond simple counts). BigQuery is purpose-built for this workload and charges only for bytes scanned, making it cost-effective for append-heavy, query-occasional patterns.

### Firestore is not negotiable for operational reads

The dashboard needs sub-100ms reads for "show me the top 20 signals right now." BigQuery's query latency (seconds) is unacceptable for this. Firestore's document reads are consistently fast and scale automatically.

### The Anti-Pattern We're Avoiding

Using Firestore as both the operational store AND the analytical warehouse leads to:
- Expensive read patterns (scanning collections for aggregation)
- Complex indexing to support analytical queries
- Document structure distorted to serve two masters
- Cost explosion as historical data accumulates

Using BigQuery as the real-time backend leads to:
- Multi-second latency on dashboard page loads
- Slot contention between dashboard queries and batch processing
- Over-provisioned BigQuery reservations to keep latency low

By separating these roles, each store operates in its sweet spot.
