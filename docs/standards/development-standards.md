# Development Standards

Standards and conventions for all contributors to the Signal monorepo.

---

## Coding Standards

### TypeScript

- **Strict mode always.** `"strict": true` in all `tsconfig.json` files. No `any` unless explicitly justified with a comment explaining why.
- **No enums.** Use `as const` objects or union types. Enums have surprising runtime behavior and don't survive JSON serialization.
- **Explicit return types on exported functions.** Internal functions may use inference. Exported functions must declare their return type.
- **No default exports.** Named exports only. This makes imports grep-able and refactor-safe.
- **No barrel files in packages with more than 10 modules.** Barrel files (`index.ts` re-exporting everything) defeat tree-shaking and create circular dependency traps. Each module should be importable directly.

### Error Handling

- **No swallowed errors.** Every `catch` block must either re-throw, log with context, or return a typed error. Empty catch blocks are forbidden.
- **Structured errors in APIs.** All API errors return `{ error: { code: string, message: string, details?: unknown } }`. The `code` is machine-readable (e.g., `SIGNAL_NOT_FOUND`). The `message` is human-readable.
- **Result types for operations that can fail predictably.** Use `{ ok: true, data: T } | { ok: false, error: E }` pattern for business logic. Reserve `throw` for truly exceptional/unexpected situations.

### Async

- **Always `await` promises.** No fire-and-forget promises unless explicitly wrapped in a `void` call with error handling.
- **No `Promise.all` on unbounded arrays.** Use `p-limit` or similar for concurrency control.

---

## Monorepo Rules

### Package Structure

```
packages/
  contracts/      # Zod schemas, types, OpenAPI. ZERO runtime deps beyond zod.
  ui/             # React components. Depends on contracts for types.
  config/         # Shared runtime env validation (Zod), typed loaders for api/services. No cloud SDKs.
  tooling/        # Build scripts, codegen. Dev-only.

apps/
  web/            # Next.js app. Depends on contracts, ui.
  api/            # Fastify app. Depends on contracts.

services/
  ingest/         # Cloud Run service. Depends on contracts.
  intel/          # Cloud Run service. Depends on contracts.
```

### Dependency Rules

1. **`packages/contracts` depends on nothing except `zod`.** It is the leaf of the dependency graph.
2. **`apps/*` and `services/*` may depend on `packages/*` but NEVER on each other.** An app must not import from a service. A service must not import from an app.
3. **`services/*` may NOT depend on `packages/ui`.** Services have no UI.
4. **No circular dependencies.** Turborepo will detect these. Fix them immediately.
5. **Version pinning:** Use exact versions (`"zod": "3.23.8"`) not ranges (`"zod": "^3.23.8"`) in `packages/contracts`. Apps and services may use caret ranges for non-contract dependencies.

### Workspace Commands

All commands are run from the repo root via Turborepo:

```bash
pnpm turbo build          # Build all packages
pnpm turbo test           # Run all tests
pnpm turbo lint           # Lint all packages
pnpm turbo typecheck      # Type-check all packages
```

Per-package commands:
```bash
pnpm --filter @signal/web dev       # Start web dev server
pnpm --filter @signal/api dev       # Start API dev server
pnpm --filter @signal/contracts build  # Build contracts
```

---

## Package Boundaries

### What Goes Where

| Question | Answer |
|---|---|
| Where does a Zod schema go? | `packages/contracts` — always |
| Where does a React component go? | `packages/ui` if reusable, `apps/web` if page-specific |
| Where does an API route handler go? | `apps/api` |
| Where does ingestion logic go? | `services/ingest` |
| Where does scoring logic go? | `services/intel` |
| Where does a Pub/Sub event schema go? | `packages/contracts` |
| Where does a utility function go? | In the package that uses it. If used by 2+ packages, move to a shared util in the appropriate package. Do NOT create a generic `utils` package. |
| Where does Terraform config go? | `infra/` (future) |

### What Crosses Boundaries

- **HTTP requests** between `apps/web` and `apps/api` — validated against `packages/contracts` on both sides.
- **Pub/Sub messages** between services — envelope schema in `packages/contracts`.
- **Firestore documents** read by multiple contexts — document schema in `packages/contracts`.
- **Nothing else.** No shared database connections, no shared state, no shared singletons.

---

## Contract-First Rules

1. **Schema before implementation.** When adding a new API endpoint or event, first add the Zod schema to `packages/contracts`. Then implement the producer. Then implement the consumer.
2. **Contracts are versioned.** Breaking changes to a contract require a new version. Old versions are supported for one release cycle.
3. **OpenAPI is generated, not hand-written.** The OpenAPI spec is derived from Zod schemas using `zod-to-openapi` or equivalent. The generated spec is committed to the repo for review.
4. **Validation at boundaries.** Every service validates incoming data against the contract schema. Trust nothing from the network.
5. **No type assertions to bypass validation.** If you need `as unknown as SomeType`, the schema is wrong. Fix the schema.

---

## Testing Expectations

### Unit Tests

- **Required for:** Business logic in `services/*`, data transformation functions, scoring rules, entity resolution logic, utility functions with non-trivial logic.
- **NOT required for:** Thin wrappers around SDK calls, configuration objects, type definitions.
- **Framework:** Vitest for all packages.
- **Coverage target:** No blanket coverage percentage. Test logic, not plumbing. A 60% coverage number with meaningful tests beats 95% with trivial ones.

### Integration Tests

- **Required for:** API route handlers (test request → response with Firestore emulator), Pub/Sub message handlers (test event → Firestore/BigQuery write).
- **Use real emulators:** Firebase Emulator Suite for Firestore and Auth. BigQuery testing uses a dedicated test dataset.
- **No mocks for storage.** If you're mocking Firestore, your test is not testing what you think it is. Use the emulator.

### End-to-End Tests

- **Scope:** MVP defers full E2E tests. Prioritize integration tests for the pipeline and API contract tests for the frontend.
- **When added:** E2E tests will cover critical paths: ingestion → signal in dashboard, alert trigger → email delivery.

### Test Organization

```
services/ingest/
  src/
    fetch.ts
    delta.ts
  __tests__/
    fetch.test.ts
    delta.test.ts
```

Tests live next to the code they test, in a `__tests__` directory. Test files mirror source file names with `.test.ts` suffix.

---

## Logging and Observability

### Structured Logging

- **Format:** JSON, always. No `console.log` with string concatenation.
- **Library:** `pino` for all services and API. Configured in `packages/config`.
- **Required fields on every log line:**
  - `timestamp` (ISO 8601)
  - `level` (trace, debug, info, warn, error, fatal)
  - `service` (e.g., `ingest`, `intel`, `api`)
  - `correlationId` (passed through from initial trigger to final output)

### Correlation IDs

Every processing chain has a correlation ID:
- **Ingestion:** Generated when Cloud Scheduler triggers a fetch. Format: `ingest:{source_id}:{timestamp}`.
- **Intel processing:** Inherited from the Pub/Sub message. Extended: `intel:{source_id}:{signal_id}`.
- **API requests:** Generated per request. Format: `api:{request_id}`.
- **Alert delivery:** Inherited from the triggering signal's correlation ID.

The correlation ID must appear in every log line, every Pub/Sub message attribute, and every Firestore write's metadata.

### Metrics

- **Cloud Run metrics:** Request count, latency, error rate, instance count (built-in).
- **Custom metrics (Cloud Monitoring):**
  - `signal.ingest.sources_fetched` (counter, by source_type)
  - `signal.ingest.deltas_detected` (counter, by source_type)
  - `signal.intel.signals_scored` (counter, by signal_type)
  - `signal.intel.enrichments_requested` (counter, by provider)
  - `signal.alerts.triggered` (counter)
  - `signal.alerts.delivered` (counter, by channel)
  - `signal.api.requests` (counter, by endpoint, status_code)

### Alerting (Operational)

- Source fetch failure rate > 50% for any source type → page on-call
- Intel processing latency p99 > 5 minutes → warn
- Dead-letter queue depth > 0 → warn (> 10 → page)
- LLM enrichment error rate > 20% → circuit breaker + warn
- API error rate > 5% → warn (> 15% → page)

---

## Naming Conventions

### Files and Directories

- **TypeScript files:** `kebab-case.ts` (e.g., `delta-detector.ts`, `signal-scorer.ts`)
- **Test files:** `kebab-case.test.ts`
- **React components:** `PascalCase.tsx` (e.g., `SignalCard.tsx`, `DashboardLayout.tsx`)
- **Directories:** `kebab-case` (e.g., `alert-rules/`, `entity-resolution/`)

### Code

- **Variables and functions:** `camelCase`
- **Types and interfaces:** `PascalCase`
- **Constants:** `SCREAMING_SNAKE_CASE` for true constants (environment thresholds, magic numbers). `camelCase` for config objects.
- **Zod schemas:** `PascalCase` with `Schema` suffix (e.g., `SignalSchema`, `AlertRuleSchema`)
- **Firestore collections:** `snake_case` (e.g., `signals`, `alert_rules`, `agent_executions`)
- **Pub/Sub topics:** `{domain}.{event}` dot-separated (e.g., `source.delta.detected`, `signal.scored`, `alert.triggered`). Dead-letter: append `.dlq`.
- **BigQuery tables:** `snake_case` (e.g., `signals`, `enrichments`, `processing_errors`)
- **GCS paths:** `/{source_type}/{source_id}/{date}/{timestamp}.{ext}`

### API Endpoints

- **REST conventions:** `GET /signals`, `GET /signals/:id`, `POST /alerts/rules`
- **Plural nouns for collections.** No verbs in URLs.
- **Query parameters for filtering:** `GET /signals?entity_id=x&min_score=70&limit=20`

---

## Pull Request Rules

### Before Opening a PR

1. **All checks pass locally:** `pnpm turbo typecheck lint test` succeeds.
2. **Contracts updated if needed:** If the PR changes a data shape crossing a boundary, the schema in `packages/contracts` is updated first.
3. **No unrelated changes.** One PR, one concern. Refactoring and feature work are separate PRs.

### PR Description

Every PR must include:
- **What:** One-sentence summary of the change.
- **Why:** Business or technical motivation.
- **How:** Brief description of the approach (not a line-by-line walkthrough).
- **Testing:** How was this tested? What scenarios were covered?
- **Breaking changes:** If any, list them explicitly.

### Review Standards

- **At least one approval required** before merge.
- **No self-merges** except for critical hotfixes (document why in the PR).
- **Reviewer checks:**
  - Does the contract schema change match the implementation?
  - Are new Firestore collections/fields documented in the bounded context?
  - Are new Pub/Sub events documented in the data flow?
  - Is error handling explicit (no swallowed errors)?
  - Are log lines structured with correlation IDs?

---

## Definition of Done

A feature is "done" when:

1. **Code is merged** to the main branch and passes CI.
2. **Contracts are updated** in `packages/contracts` for any new/changed data shapes.
3. **Tests exist** for business logic and integration points.
4. **Logging is structured** with correlation IDs on all new code paths.
5. **Error handling is explicit** — no silent failures, no swallowed errors.
6. **Documentation is updated** — architecture docs if a new boundary is introduced, ADR if a significant decision was made.
7. **No new lint warnings.** Fix warnings, don't suppress them.
8. **Peer-reviewed** with at least one approval.

---

## Rules to Avoid AI Slop

When using AI-assisted development tools:

1. **No generated code without understanding.** If you can't explain what the code does line by line, don't commit it.
2. **No speculative abstractions.** AI tools love generating interfaces, factories, and adapters. Only add an abstraction when you have two concrete consumers that need it.
3. **No placeholder implementations.** `// TODO: implement this` is not an implementation. Either implement it or don't create the file.
4. **No generic error messages.** `"Something went wrong"` is AI slop. Every error message must describe what failed and include context.
5. **No unnecessary comments.** Code should be self-documenting. Comments explain why, not what. `// increment counter` above `counter++` is slop.
6. **No copy-paste patterns.** If AI generates similar code for multiple handlers, extract the pattern into a shared utility ONCE and use it. Don't accept repetitive generated code.
7. **Review AI-generated tests skeptically.** AI-generated tests often test the implementation rather than the behavior. Ask: "Would this test fail if the feature was broken? Would this test pass with a broken implementation?"
8. **No hallucinated APIs.** Verify that every imported function, every SDK method, and every configuration option actually exists in the version of the library you're using.
9. **File review after every edit.** After AI edits a file, review the entire file, not just the diff. AI tools sometimes introduce inconsistencies elsewhere in the file.
10. **Naming must be precise.** `handleData`, `processStuff`, `doThings` are signs of AI slop. Names must describe the specific operation: `detectSourceDelta`, `scoreSignalRelevance`, `evaluateAlertRules`.
