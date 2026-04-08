# Signal

Enterprise intelligence platform for board members and BI teams in a large industrial energy group.

Signal ingests public and official sources about competitors, clients, technologies, projects, commodities, and annual reporting. It detects changes, extracts candidate events, promotes qualifying events into scored signals (SourceContent → ExtractedEvent → Signal), and serves a command-center dashboard with daily briefs and configurable alerts.

## Monorepo Package Map

```
signal/
├── apps/
│   ├── web/                  # Next.js dashboard (TypeScript)
│   └── api/                  # Fastify API server (TypeScript, Cloud Run)
├── services/
│   ├── ingest/               # Source fetching, archiving, delta detection
│   └── intel/                # Normalization, scoring, enrichment
├── packages/
│   ├── contracts/            # Zod schemas, OpenAPI specs, shared types
│   ├── ui/                   # Design system components
│   ├── config/               # Shared runtime config helpers, env validation
│   ├── maire-seed-import/    # MAIRE CSV → Firestore seed importer (CLI, not runtime API)
│   ├── workspace-staging-bootstrap/  # Staging workspace + member upsert (CLI, not runtime API)
│   ├── firebase-auth-uid-lookup/     # Staging: Auth UID by email (CLI, not runtime API)
│   └── tooling/              # Build scripts, codegen, dev utilities
├── infra/
│   ├── terraform/            # GCP foundation (Terraform) — see infra/terraform/README.md
│   ├── bigquery/             # Analytical DDL + JSON table schemas (WS3.2)
│   ├── gcs/                  # GCS archive naming + example manifests (WS3.3)
│   └── sources/              # Sample source registry JSON (WS4.1) — see infra/sources/README.md
└── docs/
    ├── architecture/         # System architecture docs
    ├── standards/            # Development standards
    └── adr/                  # Architecture Decision Records
```

## Architecture Principles

1. **Contract-first** — Zod schemas in `packages/contracts` are the single source of truth for all data shapes crossing service boundaries.
2. **Delta processing** — The system reacts to changes in sources, not full-world rescans.
3. **Explicit read models** — The frontend never reads directly from Firestore or BigQuery. All product reads go through `apps/api`.
4. **Storage role separation** — GCS for raw archive/provenance, Firestore for operational state, BigQuery for historical analytics.
5. **LLM as escalation** — Deterministic pipelines handle the default path. LLMs enrich or escalate when deterministic methods are insufficient.
6. **Async by default for writes, sync for reads** — Ingestion, processing, and scoring are async. Dashboard reads and user operations are sync through the API.
7. **Staged deployability** — Every bounded context can be deployed independently. The MVP ships incrementally.

## Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm 9+
pnpm install
pnpm check              # typecheck + lint + test (pre-PR gate)
pnpm build              # full build (includes Next.js production build)
```

### Development

```bash
pnpm dev                # starts all services in parallel (turbo)
```

| Service | URL |
|---|---|
| apps/web | http://localhost:3000 |
| apps/api | http://localhost:4000 |
| services/ingest | http://localhost:4001 |
| services/intel | http://localhost:4002 |

Per-workspace commands:

```bash
pnpm --filter @signal/web dev       # start web only
pnpm --filter @signal/api dev       # start api only
```

### MAIRE business-truth CSV seed (go-live)

Imports `Entities.csv`, `Sources.csv`, and `Watchlists.csv` into Firestore using `@signal/maire-seed-import` (validates with Zod; idempotent upserts). Not a public API — run from an operator workstation with Application Default Credentials.

```bash
# Dry-run (validate only; no writes)
pnpm maire-seed -- --workspace <WORKSPACE_ID> \
  --file-entities /path/to/Entities.csv \
  --file-sources /path/to/Sources.csv \
  --file-watchlists /path/to/Watchlists.csv

# Dry-run strict (non-zero exit if any invalid row — e.g. CI)
pnpm maire-seed -- --workspace <WORKSPACE_ID> --strict \
  --file-entities /path/to/Entities.csv \
  --file-sources /path/to/Sources.csv \
  --file-watchlists /path/to/Watchlists.csv

# Apply (writes to Firestore)
pnpm maire-seed -- --workspace <WORKSPACE_ID> --apply \
  --file-entities /path/to/Entities.csv \
  --file-sources /path/to/Sources.csv \
  --file-watchlists /path/to/Watchlists.csv
```

See [docs/architecture/maire-seed-import-v1.md](docs/architecture/maire-seed-import-v1.md).

### Available Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start all workspace dev servers |
| `pnpm build` | Build all workspaces |
| `pnpm typecheck` | TypeScript type-check all workspaces |
| `pnpm lint` | Lint and format check with Biome |
| `pnpm lint:fix` | Auto-fix lint/format issues |
| `pnpm format` | Format all files with Biome |
| `pnpm test` | Run all workspace tests |
| `pnpm check` | Run typecheck + lint + test (pre-PR gate) |
| `pnpm workspace-bootstrap` | Staging Firestore workspace + member upsert (pass `-- --uid … [--apply]`) |
| `pnpm firebase-auth-uid` | Lookup Firebase Auth UID by email (`FIREBASE_PROJECT_ID`, ADC; pass `-- --email …`) |
| `pnpm clean` | Remove build artifacts |

## Environment Variables

Each Node service loads config via **`packages/config`** (`loadApiRuntimeConfig`, `loadIngestRuntimeConfig`, `loadIntelRuntimeConfig`). See [packages/config/README.md](packages/config/README.md) for the full variable list, secret naming (Terraform), and public vs private rules.

Copy `.env.example` → `.env` where needed:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp services/ingest/.env.example services/ingest/.env
cp services/intel/.env.example services/intel/.env
```

| Variable | Default | Used by |
|---|---|---|
| `NODE_ENV` | `development` | api, ingest, intel |
| `PORT` | 4000 / 4001 / 4002 | api, ingest, intel |
| `LOG_LEVEL` | `info` | api, ingest, intel (Pino) |
| `SIGNAL_SERVICE_VERSION` | package version or `0.0.0` | health/version metadata |
| `FIREBASE_PROJECT_ID` | — (required for `apps/api`) | API: Firebase Admin + token verification |
| `SIGNAL_DEFAULT_WORKSPACE_ID` | — (required for `apps/api`) | API: default Firestore workspace id for membership |
| `CORS_ORIGINS` | `http://localhost:3000` | API: allowed browser origins |

**apps/web (Firebase client + API URL):** copy [apps/web/.env.example](apps/web/.env.example) to `.env.local` and set **`NEXT_PUBLIC_FIREBASE_*`** from the Firebase console (Web app config) and **`NEXT_PUBLIC_SIGNAL_API_BASE_URL`** (e.g. `http://localhost:4000`) so the browser can call `GET /v1/auth/me`. Only **`NEXT_PUBLIC_*`** values are exposed to the browser. See [apps/web/README.md](apps/web/README.md).

**apps/api (Firebase Admin + Firestore):** set `FIREBASE_PROJECT_ID`, **`SIGNAL_DEFAULT_WORKSPACE_ID`**, and optionally `CORS_ORIGINS`. Use **Application Default Credentials** locally: `gcloud auth application-default login`. Optionally set `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON path (never commit the file). Seed **Firestore** with `workspaces/{id}` and `workspaces/{id}/members/{uid}` — see [packages/config/README.md](packages/config/README.md).

**API observability:** Responses include **`X-Request-Id`**; clients may send a valid inbound id for correlation. JSON errors include `requestId` in the payload. Security-related access lines are structured (see [apps/api/README.md](apps/api/README.md)).

In GCP, secrets are expected to be **injected as env vars** at deploy time; the app does not call Secret Manager directly in this phase.

**Do NOT commit `.env` files.** Only `.env.example` files are tracked in git.

## CI

GitHub Actions runs on every push to `main` and every pull request:

1. **Install** — `pnpm install --frozen-lockfile`
2. **Typecheck** — `pnpm typecheck`
3. **Lint** — `pnpm lint` (Biome)
4. **Test** — `pnpm test` (Vitest)
5. **Build** — `pnpm build` (Next.js production build + tsc)

The pipeline fails fast on any error. Run `pnpm check` locally before opening a PR to catch issues early.

See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Local Development

Local development requires:
- Node.js 20+
- pnpm 9+

For **Firebase Auth** (WS2 Epic 2.1 baseline):
- A Firebase project with Authentication enabled (e.g. Google provider for local sign-in).
- Google Cloud SDK (`gcloud`) for **Application Default Credentials** when running `apps/api` locally (`gcloud auth application-default login`).

For **workspace membership** (WS2 Epic 2.2):
- Firestore enabled on the same project. Manually create `workspaces/{SIGNAL_DEFAULT_WORKSPACE_ID}` with `name`, `isActive: true`, and a subcollection `members` document `{uid}` matching the signed-in Firebase Auth user, with `role` (`admin` \| `analyst` \| `viewer`), `isActive: true`, and `uid` set. No automatic provisioning is performed by the app.

Optional later:
- Firebase Emulator Suite (Auth/Firestore) for offline integration tests.

The monorepo uses pnpm workspaces and Turborepo for task orchestration. Each package declares its own dependencies and build targets. Shared configuration lives in `packages/config`.

See [Development Standards](docs/standards/development-standards.md) for coding conventions and contribution rules.

## Documentation

| Document | Purpose |
|---|---|
| [Runtime config (`@signal/config`)](packages/config/README.md) | Env loaders, LOG_LEVEL, secrets naming, public vs private |
| [Terraform (GCP)](infra/terraform/README.md) | Infrastructure layout, IAM, Firestore notes, init/plan/apply |
| [North Star Architecture](docs/architecture/north-star-architecture.md) | System design, principles, boundaries |
| [Bounded Contexts](docs/architecture/bounded-contexts.md) | Context ownership, inputs/outputs, storage |
| [Data Flow v2](docs/architecture/data-flow-v2.md) | End-to-end data flow (three-layer pipeline) and failure handling |
| [BigQuery analytical schema v1](docs/architecture/bigquery-analytical-schema-v1.md) | Analytics dataset tables, partitioning, boundaries vs Firestore/GCS |
| [infra/bigquery](infra/bigquery/README.md) | DDL + JSON schema artifacts for BigQuery MVP tables |
| [GCS source archive v1](docs/architecture/gcs-source-archive-v1.md) | Raw archive paths, provenance, manifest rules |
| [infra/gcs](infra/gcs/README.md) | GCS naming conventions + example manifest |
| [Source registry v1](docs/architecture/source-registry-v1.md) | Global `sources` collection, schema, pipeline boundaries |
| [Fetch pipeline v1](docs/architecture/fetch-pipeline-v1.md) | Ingest HTTP GET, fingerprint, delta, operational Firestore updates (WS4.2) |
| [services/ingest](services/ingest/README.md) | Ingest service env, `/healthz`, `/internal/run-once` |
| [infra/sources](infra/sources/README.md) | Sample source registry JSON (dev/reference only) |
| [Glossary v1](docs/architecture/glossary-v1.md) | Frozen MVP terminology — authoritative definitions |
| [Canonical Ontology](docs/architecture/canonical-ontology.md) | Data objects, lifecycle, provenance, MVP scope |
| [Entity Taxonomy v1](docs/architecture/entity-taxonomy-v1.md) | Entity types, fields, aliases, relationships |
| [Event & Signal Taxonomy v1](docs/architecture/event-and-signal-taxonomy-v1.md) | Event families, signal types, mapping rules |
| [Relationships & Identity v1](docs/architecture/relationships-and-identity-v1.md) | IDs, aliases, dedup, entity resolution |
| [Scoring Model v1](docs/architecture/scoring-model-v1.md) | Scoring dimensions, weighting, explainability |
| [Development Standards](docs/standards/development-standards.md) | Coding rules, PR process, definition of done |
| [ADR-0001: Monorepo & Service Boundaries](docs/adr/ADR-0001-monorepo-and-service-boundaries.md) | Why monorepo, why this storage split |
| [ADR-0002: Agent Tooling & Function Calling](docs/adr/ADR-0002-agent-tooling-and-function-calling-boundary.md) | Agent layer design decisions |
| [Internal tools registry v1 (WS5.1)](docs/architecture/internal-tools-v1.md) | Typed tool contracts in `@signal/contracts`, runtime registry in `services/intel` (no LLM) |
| [Agent orchestrator v1 (WS5.4)](docs/architecture/agent-orchestrator-v1.md) | Single-step execution envelope + metering over the internal tool registry (no provider adapters) |
| [Perplexity adapter v1 (WS5.5)](docs/architecture/perplexity-adapter-v1.md) | Optional enrichment for `summarize_delta` only; deterministic pipeline unchanged |
| [Serving API contracts v1 (WS6.1)](docs/architecture/serving-api-contracts-v1.md) | Zod DTOs for `/v1` read surfaces (`api-*` in `@signal/contracts`); implementation in WS6.2 |
| [ADR-0003: Ontology & Signal Model](docs/adr/ADR-0003-canonical-ontology-and-signal-model.md) | Three-layer pipeline, entity taxonomy, scoring model |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, TypeScript |
| Backend API | Fastify, TypeScript, Cloud Run |
| Auth | Firebase Auth |
| Operational State | Firestore |
| Analytics / History | BigQuery |
| Raw Archive | Google Cloud Storage |
| Async Orchestration | Cloud Scheduler, Pub/Sub, Cloud Tasks |
| Email | Resend |
| Contracts | Zod, OpenAPI |
| Infrastructure | Terraform |
| Agent Layer | Provider-agnostic function calling |
