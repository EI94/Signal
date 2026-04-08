# ADR-0003: Canonical Ontology and Signal Model

**Status:** Accepted
**Date:** 2026-04-04
**Authors:** Architecture Team

---

## Context

Signal needs a canonical data model that is precise enough to drive:
- Zod schema implementation in `packages/contracts`
- Firestore document design
- BigQuery table design
- Pub/Sub event payloads
- API contracts
- Agent tool schemas

The team needs to decide:
1. How to model the pipeline from raw source content to product-facing signals
2. What entity types to include for MVP
3. How to handle identity, aliases, and deduplication
4. How to model alerts and briefs relative to signals
5. How to score signals in an explainable, deterministic way

---

## Decision

### 1. Three-Layer Pipeline: SourceContent → ExtractedEvent → Signal

The data model enforces a strict three-layer separation:

- **SourceContent** — immutable record of fetched raw material. Owned by `services/ingest`. Stored in GCS (body) and BigQuery (metadata). Short-lived in Firestore (active window only).
- **ExtractedEvent** — candidate fact extracted from one or more SourceContents. Owned by `services/intel`. May be low-confidence, ambiguous, or noise. Primary store is BigQuery; active window in Firestore for dedup.
- **Signal** — scored, deduplicated, product-facing intelligence unit. Owned by `services/intel`. Primary read model in Firestore; full history in BigQuery.

These three objects have different lifecycles, different storage profiles, and different audiences. They are never conflated into a single object.

**Why three layers, not two or one:**

A two-layer model (source → signal) forces the signal to carry both extraction metadata and product-facing semantics. This creates signals that are either too noisy (every extraction becomes a signal) or too opaque (the extraction details are lost). The middle layer (ExtractedEvent) serves as a quality gate: only events that pass confidence, relevance, and dedup thresholds become signals.

A one-layer model (just signals) makes reprocessing impossible — if the extraction logic changes, there's no intermediate representation to re-evaluate. The three-layer model allows: "re-extract events from the same source content" and "re-score signals from the same events" as independent operations.

### 2. Entity Types for MVP: Organization, Project, Technology, Commodity, Geography

Five business entity types plus four system/config types (Source, Watchlist, User, Workspace).

**Person is excluded from MVP.** The product monitors institutional activity, not individuals. Person names appear as extracted facts within events (e.g., "CEO name" in an earnings event), not as standalone entities. Adding Person later is additive and non-breaking.

**Tender is not an entity type.** Tenders are events (`tender_opportunity` event family), not long-lived entities. If a tender leads to a named project, it becomes a Project entity through the award event. This avoids creating thousands of short-lived entity records.

**Watchlist is a filter, not a business entity.** Watchlists group entity IDs for user-facing filtering and alert scoping. They do not introduce new intelligence semantics. Signals are not "in" watchlists — signals are linked to entities, and watchlists filter by entity overlap.

### 3. Deterministic IDs for Pipeline Objects; UUIDs for Human-Created Objects

Pipeline objects (SourceContent, ExtractedEvent, Signal) use deterministic content-hash-based IDs. This makes the entire pipeline idempotent: reprocessing the same input produces the same IDs, enabling safe retries and deduplication without additional coordination.

Human-created objects (Entity, Source, Watchlist, AlertRule, User) use UUIDs because they have no natural content-addressable key.

### 4. Alerts and Briefs Are Downstream Derivatives

AlertDelivery and Brief/BriefItem are NOT primary ontology roots. They are rendering artifacts:

- An AlertDelivery records that a signal matched a rule and a notification was sent. Deleting the alert rule doesn't delete the signal.
- A BriefItem is a point-in-time snapshot of a signal's state when the brief was generated. If the signal changes later, the brief item is unaffected.

Neither introduces new intelligence truth. Both reference signals by ID and can only be understood in the context of the signals they reference.

**Why this matters:** Systems that treat alerts or briefs as independent intelligence objects eventually develop semantic drift — the alert says one thing, the underlying signal says another, and there's no way to reconcile them. By modeling them as derivatives with mandatory signal references, we ensure a single source of truth.

### 5. Alias-Based Entity Resolution as a First-Class Concern

Entity resolution (matching names in source content to known entities) is one of the hardest problems in the pipeline. The ontology addresses this by:

- Giving every entity a structured `aliases[]` array with typed entries (trade_name, abbreviation, former_name, local_name, ticker, subsidiary_name, etc.)
- Defining a precedence-ordered matching algorithm (external ID → canonical name → alias → fuzzy)
- Assigning confidence scores to each match type
- Defining collision handling rules for ambiguous aliases
- Supporting subsidiary modeling through `parentEntityId` + subsidiary aliases on the parent

This is NOT a post-MVP afterthought. Identity resolution quality directly determines signal quality. A signal linked to the wrong entity is worse than no signal at all.

### 6. Deterministic Scoring with Five Explainable Dimensions

The scoring model uses five dimensions (relevance, impact, freshness, confidence, sourceAuthority) on a 0–100 integer scale with configurable weights.

Every dimension has a formulaic computation from structured data. No LLM is involved in scoring for MVP. The composite score is a weighted sum that can be fully explained: "This signal scored 82 because relevance=90 (competitor entity, high match confidence), impact=80 (project award), freshness=65 (detected 48h ago), confidence=85 (deterministic extraction, all fields populated), sourceAuthority=95 (official IR page)."

---

## Consequences

### Benefits

1. **Pipeline is replayable.** Because SourceContent, ExtractedEvent, and Signal are separate objects with deterministic IDs, any stage can be replayed independently. If extraction logic improves, re-run intel against existing source content in GCS. If scoring weights change, re-score existing events.

2. **Scoring is auditable.** Every signal carries its full scoring breakdown. A board member asking "Why is this important?" gets a concrete answer, not "the AI said so."

3. **Entity resolution is explicit.** The alias system and matching rules are documented and deterministic. When resolution fails, the failure is visible (low confidence, ambiguity notes) rather than silent.

4. **Alerts and briefs are traceable.** Every alert delivery and brief item points back to a signal, which points back to events, which point back to source content. The provenance chain is unbreakable.

5. **MVP scope is controlled.** By explicitly excluding Person, Tender-as-entity, sentiment scoring, and signal threading, the ontology avoids premature complexity. Each exclusion is documented with a rationale, making post-MVP additions deliberate rather than gap-filling.

### Tradeoffs

1. **Three-layer pipeline adds processing stages.** A simpler source-to-signal pipeline would have fewer moving parts. But the added stages (extracted events as intermediate) prevent quality problems that are much harder to fix later.

2. **Deterministic IDs couple identity to content.** If entity resolution is non-deterministic (e.g., LLM-assisted), the eventId changes across runs. Mitigation: entity resolution uses deterministic rules for MVP; LLM enrichment updates existing events rather than creating new ones.

3. **No Person entity limits certain queries.** "What has [CEO Name] been involved in?" is not a first-class query in MVP. It can be partially answered by searching signal bodies, but not by entity-level filtering. This is an acceptable tradeoff for MVP scope.

4. **Alias-based entity resolution requires upfront data work.** Every entity must be seeded with its canonical name and key aliases. This is a manual process that requires domain expertise. There is no shortcut.

---

## Alternatives Considered

### Single-Layer Model (Source → Signal)

**Rejected because:**
- No intermediate quality gate. Every extraction becomes a signal, including noise.
- No ability to re-extract from source content independently of re-scoring.
- No deduplication at the event level. Cross-source dedup would happen at the signal level, mixing concerns.

### Knowledge-Graph-First Approach (Entities with Typed Edges)

**Rejected because:**
- A full knowledge graph requires edge types, property graphs, and graph query semantics. This is a different product (a knowledge base), not an intelligence dashboard.
- Signal's value proposition is "what happened recently that matters," not "what is the relationship between A and B." The temporal, event-driven nature of Signal is poorly served by a static graph model.
- Graph maintenance (keeping edges current as companies merge, projects evolve, etc.) is an ongoing cost with no clear MVP consumer.

Entity-to-entity relationships are captured implicitly through signals: "Org A partnered with Org B" is a signal, not a graph edge. This is sufficient for MVP.

### Person as First-Class Entity

**Rejected for MVP because:**
- Person identity resolution is a solved problem only in name, not in practice. Name ambiguity, title changes, multi-lingual name forms, and the sheer volume of person mentions in sources make this a research project, not an MVP feature.
- The intelligence use case is institutional. Board members ask about companies and projects, not about individuals.
- Person can be added post-MVP if user research demonstrates demand.

### Separate Tender Entity Type

**Rejected because:**
- Tenders are ephemeral. They open, close, and result in awards or cancellations. Modeling them as entities creates a management burden (who updates the tender status? when does it expire?) without proportional value.
- Tenders are better modeled as events: `tender_opportunity` event family, with time sensitivity baked into the freshness dimension of scoring.
- If a tender leads to a named project, the project is created as a Project entity. The tender event is provenance for the project's origin.

### LLM-Assisted Scoring

**Rejected for MVP because:**
- Scoring must be explainable and deterministic. "The model gave it a 7" is not an explanation.
- LLM scoring adds cost, latency, and non-determinism. For 500+ signals per day, this is unjustified.
- The five-dimension deterministic model covers the essential scoring axes. If sentiment or strategic-fit scoring is needed later, it can be added as a new dimension without replacing existing ones.

---

## Related Documents

- [Canonical Ontology](../architecture/canonical-ontology.md)
- [Entity Taxonomy v1](../architecture/entity-taxonomy-v1.md)
- [Event and Signal Taxonomy v1](../architecture/event-and-signal-taxonomy-v1.md)
- [Relationships and Identity v1](../architecture/relationships-and-identity-v1.md)
- [Scoring Model v1](../architecture/scoring-model-v1.md)
