# ADR-0002: Agent Tooling and Function-Calling Boundary

**Status:** Accepted
**Date:** 2026-04-04
**Authors:** Architecture Team

---

## Context

Signal includes an agentic layer that allows users to interact with the intelligence platform through natural language. This layer must:

- Support function calling / tool use by LLMs
- Be provider-agnostic (not locked to OpenAI, Anthropic, Google, or any single provider)
- Integrate with the existing data layer (signals, entities, sources)
- Be extensible for future MCP (Model Context Protocol) tool integrations
- Not replace deterministic pipelines with LLM-driven processing

The team needs to decide:
1. How to define the agent/tool boundary
2. How to keep the architecture provider-agnostic
3. Where LLMs belong in the processing pipeline vs. where they don't
4. How to prepare for MCP without building it prematurely

---

## Decision

### 1. Agent Orchestration is Provider-Agnostic

The agent layer defines tools using Zod schemas in `packages/contracts`. These schemas are the canonical definition of what each tool accepts and returns. At runtime, schemas are converted to JSON Schema for the specific LLM provider's function-calling format.

The provider adapter layer is intentionally thin:

```
User query
    │
    ▼
Agent orchestrator (apps/api)
    │
    ├── Tool registry: Zod schemas → JSON Schema
    ├── Provider adapter: converts tool defs to provider-specific format
    ├── Tool executor: runs tool functions, returns structured results
    └── Response composer: returns results to provider for synthesis
```

**No provider-specific logic leaks into tool definitions or execution.** A tool that queries signals works identically regardless of whether the orchestrating LLM is GPT-4, Claude, Gemini, or a future model.

Provider adapters handle only:
- Converting JSON Schema tool definitions to the provider's expected format
- Parsing the provider's function-call response format
- Managing provider-specific parameters (temperature, max tokens, etc.)

### 2. Function Calling is Schema-First and JSON-First

Every agent tool is defined as:

```typescript
// In packages/contracts
const QuerySignalsToolSchema = z.object({
  name: z.literal("query_signals"),
  description: z.literal("Query scored signals with optional filters"),
  parameters: z.object({
    entity_id: z.string().optional(),
    signal_type: z.string().optional(),
    min_score: z.number().int().min(0).max(100).optional(),
    date_from: z.string().datetime().optional(),
    date_to: z.string().datetime().optional(),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  returns: z.object({
    signals: z.array(SignalSchema),
    total_count: z.number(),
  }),
});
```

**Why schema-first:**
- Tool definitions are validated at compile time, not discovered at runtime.
- Adding a new tool means adding a schema to `packages/contracts`, implementing an executor in `apps/api`, and registering it — all type-checked.
- The same schema generates documentation, validation, and LLM tool definitions. One source of truth.

**Why JSON-first:**
- LLM function calling operates on JSON. Tools that accept or return non-JSON (binary, streams, HTML) create friction and require serialization hacks.
- JSON results are inspectable, loggable, and cacheable. This matters for debugging and cost attribution.
- MCP tools also communicate via JSON. Aligning on JSON now simplifies future MCP integration.

### 3. LLMs Are Not the Primary Ingestion Engine

The processing pipeline is explicitly divided into deterministic and model-assisted paths:

**Deterministic Pipeline (default path, always runs):**
- Source fetching → HTTP client
- Content archiving → GCS write
- Delta detection → content hash comparison
- Content parsing → type-specific parsers (HTML, PDF, RSS, JSON)
- Entity resolution → exact match on identifiers, fuzzy match on names
- Signal extraction → rule-based extraction from parsed content
- Scoring → weighted heuristic scoring
- Alert evaluation → predicate matching against rules

**Model-Assisted Pipeline (escalation path, opt-in):**
- Low-confidence entity resolution → LLM disambiguates ambiguous matches
- Semantic enrichment → LLM extracts insights from complex/unstructured content
- Executive brief summary → LLM composes a natural-language overview
- User-initiated agent queries → LLM orchestrates tool calls

**Why this split matters:**

| Concern | Deterministic | Model-Assisted |
|---|---|---|
| Cost | Pennies per source | Dollars per LLM call |
| Latency | Milliseconds | Seconds |
| Reproducibility | Identical output for identical input | Non-deterministic |
| Availability | Depends only on our infra | Depends on external provider |
| Debuggability | Trace every step | Prompt inspection, but output varies |
| Auditability | Exact rules applied | "The model said so" |

Running 500 sources through an LLM daily would cost hundreds of dollars and provide marginal benefit over deterministic parsing for structured sources. LLMs add value for ambiguous content and natural-language interaction, not for routine extraction.

### 4. Deterministic Pipelines vs. Model-Assisted Pipelines

A clear decision tree determines when to use each:

**Use deterministic processing when:**
- The source format is structured (RSS, JSON API, known HTML templates)
- Entity matching is unambiguous (exact identifier match)
- The signal type is well-defined (financial filing, price change, regulatory update)
- The extraction rules are codified and tested

**Escalate to model-assisted processing when:**
- Entity matching returns multiple candidates with similar confidence
- The source content is unstructured prose without clear structure
- The signal requires semantic interpretation (e.g., "Is this announcement positive or negative for our business?")
- The user explicitly requests AI analysis through the agent interface

**Never use LLM for:**
- Delta detection (this is a hash comparison, not a semantic task)
- Source fetching or scheduling (this is infrastructure, not intelligence)
- Alert rule evaluation (this is predicate matching, not interpretation)
- Data storage operations (this is CRUD, not cognition)

### 5. MCP Readiness Without Premature Implementation

The architecture prepares for MCP integration through design decisions, not code:

**What we build now:**
- A tool registry with a stable interface: `{ name, description, parameters (Zod), execute (function) }`
- Each tool is a self-contained unit with schema + executor
- The agent orchestrator discovers tools from the registry, not from hardcoded lists

**What we defer:**
- MCP server implementation
- MCP client integration
- Dynamic tool discovery from external MCP servers
- MCP-specific transport handling

**Why this is sufficient:**
- The tool registry interface is compatible with MCP's tool definition model (name, description, JSON Schema parameters)
- When MCP support is added, MCP-provided tools can be registered as entries in the same registry
- The agent orchestrator doesn't need to know whether a tool is internal or MCP-provided — it calls the executor with validated parameters and gets a JSON result
- No MCP-specific abstractions exist in the codebase until MCP is actually needed

---

## Consequences

### Benefits

1. **Provider lock-in avoided.** Switching from one LLM provider to another requires only a new adapter, not a rewrite of tool definitions or execution logic.
2. **Cost is controllable.** LLM usage is gated behind explicit escalation criteria. The default path costs nearly nothing per signal.
3. **Pipeline is reliable without LLMs.** If every LLM provider goes down simultaneously, Signal still ingests, detects deltas, normalizes, scores (with heuristics), and serves signals. Only enrichment and agent queries are degraded.
4. **MCP integration has a clear path.** When the time comes, it's an additive change to the tool registry, not an architectural rewrite.
5. **Testing is straightforward.** Deterministic tools are unit-testable with predictable inputs/outputs. LLM interactions are integration-tested with recorded responses.

### Tradeoffs

1. **Deterministic extraction requires upfront rule engineering.** For each source type, someone must write parsing rules. This is more work than "just send it to GPT," but produces reliable, auditable, cost-effective results.
2. **The escalation boundary requires judgment calls.** "When is confidence too low?" is a tunable parameter, not a fixed rule. We'll need to calibrate thresholds based on real data.
3. **Provider-agnostic abstraction has a maintenance cost.** Each new LLM provider that changes its function-calling format requires an adapter update. This is a small, contained cost.

---

## Alternatives Considered

### LLM-First Pipeline (Everything Through the Model)

**Rejected because:**
- Cost: Processing 500+ sources daily through an LLM costs orders of magnitude more than deterministic parsing.
- Reliability: Upstream LLM outages would halt the entire pipeline, not just enrichment.
- Reproducibility: The same source processed twice would produce different signals, making debugging and auditing unreliable.
- Latency: LLM inference adds seconds per source. For daily batches, this adds up.

### Provider-Specific Agent Framework (e.g., OpenAI Assistants API)

**Rejected because:**
- Full lock-in to a single provider's orchestration model, tool format, and billing.
- No portability. Switching providers means rewriting the agent layer.
- Provider-specific frameworks lag behind the provider's latest capabilities. A thin adapter is always more current.

### Build MCP Server Now

**Rejected because:**
- No consumer exists yet. Building an MCP server before there's an MCP client to connect to is speculative engineering.
- The tool registry pattern is MCP-compatible without being MCP-specific. We get 90% of the readiness with 0% of the premature complexity.
- MCP protocol is still evolving. Building now risks building against a moving target.

### Separate Agent Service

**Rejected for MVP because:**
- Agent queries use the same data layer as API endpoints (Firestore signals, entities). A separate service would either duplicate the data access layer or add network calls for every tool execution.
- For MVP volume (few concurrent users), the agent orchestrator runs efficiently as a module within `apps/api`.
- If agent usage scales significantly, extraction into a separate service is straightforward — the tool registry and executor interfaces are already clean boundaries.

---

## Perplexity as Enrichment/Escalation Provider

Perplexity is positioned as the preferred provider for search-grounded enrichment:

- When a signal requires additional context from the public web (e.g., "What is this company's latest quarterly performance?"), Perplexity's search-grounded responses are more suitable than a general-purpose LLM.
- Perplexity is called through the same provider-agnostic interface as any other LLM. It is not a privileged system component.
- If Perplexity is unavailable or the org prefers a different provider, the enrichment path falls back to the configured alternative without pipeline changes.
- Perplexity usage is logged and cost-attributed like any other LLM call.
