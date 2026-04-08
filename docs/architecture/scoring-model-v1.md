# Scoring Model v1

## Purpose

Every Signal must carry a composite score that answers: "How much should a board member or analyst care about this right now?" The scoring model produces this number from deterministic dimensions, making the result explainable, auditable, and debuggable.

Scoring is NOT a black box. Every dimension has a clear definition, a deterministic computation path, and a weight. Users can inspect why a signal scored the way it did. Analysts can tune weights. The system can explain every score.

---

## Scale

**All dimension scores and the composite score use integer 0–100.**

Why 0–100 and not 0.0–1.0:
- Integers are easier for non-technical users to reason about. "This signal scored 82" is clearer than "This signal scored 0.82".
- No floating-point precision issues in storage or comparison.
- Compatible with threshold-based alert rules (e.g., `minScore: 70`).
- The resolution (101 distinct values) is more than sufficient. Pretending a scoring system has sub-percentage precision is dishonest.

**Interpretation guide:**

| Range | Meaning | Expected volume |
|---|---|---|
| 90–100 | Critical — board-level attention required | < 5% of signals |
| 70–89 | High — important development, analyst review recommended | 10–20% |
| 40–69 | Medium — notable, should appear in brief if relevant | 40–50% |
| 20–39 | Low — background noise, logged but not prominent | 20–30% |
| 0–19 | Minimal — below useful threshold, may be filtered from default views | < 10% |

These are guidelines, not hard rules. The distribution will be calibrated against real data during MVP.

---

## Scoring Dimensions

### 1. Relevance (default weight: 30%)

**What it measures:** How closely does this signal relate to entities the organization actively tracks?

**Computation (deterministic):**

| Condition | Score |
|---|---|
| Signal links to ≥1 entity with `role: 'competitor'` or `role: 'client'` | 80–100 (scaled by entity match confidence) |
| Signal links to ≥1 entity in user's watchlist | 70–90 |
| Signal links to ≥1 tracked entity of any role | 50–70 |
| Signal links to ≥1 entity with `entityMatchConfidence < 70` | Score reduced proportionally |

The exact score within each band is `band_min + (entityMatchConfidence / 100) * (band_max - band_min)`.

If a signal links to multiple entities, relevance uses the highest-scoring entity match.

### 2. Impact (default weight: 25%)

**What it measures:** How significant is this type of event for business decision-making?

**Computation (deterministic):** Based on `signalType`, which is a proxy for the event family's inherent business weight.

| Signal Type | Base Impact Score |
|---|---|
| `ma_divestment` | 95 |
| `earnings_reporting_update` | 85 |
| `investment_plan_update` | 85 |
| `project_award` | 80 |
| `policy_regulatory_change` | 75 |
| `partnership_mou` | 65 |
| `geographic_expansion` | 60 |
| `technology_milestone` | 55 |
| `tender_opportunity` | 50 |
| `commodity_movement` | 45 (adjusted by magnitude if available) |

These base scores are configurable per workspace. The values above are defaults for an energy industry group.

**Modifiers:**
- If the signal's `extractedFacts` contain a disclosed monetary value above a configurable threshold (e.g., > €100M), impact is boosted by +10 (capped at 100).
- If the signal concerns a direct competitor (entity `role: 'competitor'`), impact is boosted by +5.

### 3. Freshness (default weight: 20%)

**What it measures:** How recently was the underlying event detected? Intelligence decays rapidly — a project award announced today is high-priority; the same award known for 30 days is old news.

**Computation (deterministic):** Based on hours elapsed since `signalTime.value` (or `detectedAt` if signalTime precision is `unknown`).

| Hours Since Event | Freshness Score |
|---|---|
| 0–6 hours | 100 |
| 6–24 hours | 85 |
| 24–72 hours | 65 |
| 72 hours – 7 days | 40 |
| 7–14 days | 25 |
| 14–30 days | 15 |
| > 30 days | 5 |

Freshness is recalculated when the signal is served (at query time, not at scoring time). This means the `scores.freshness` value in Firestore is the score at `scoredAt`. The API may apply a freshness adjustment at read time for dashboard display.

**Exception:** Signals with `signalTime.precision: 'quarter'` or `'year'` use a slower decay curve (2x the intervals above), because the timing is inherently imprecise.

### 4. Confidence (default weight: 15%)

**What it measures:** How much should we trust the extraction and entity resolution that produced this signal?

**Computation (deterministic):** Derived from pipeline metadata.

| Factor | Contribution |
|---|---|
| Entity match confidence (from ExtractedEvent) | 40% of confidence score |
| Source extraction method (`deterministic` = full credit, `model_assisted` = 80% credit) | 30% of confidence score |
| Number of corroborating source contents (1 = base, 2+ = boosted) | 15% of confidence score |
| Event family extraction completeness (% of required fields populated) | 15% of confidence score |

Formula:
```
confidence = (entityMatchAvgConfidence * 0.4)
           + (extractionMethodScore * 0.3)
           + (corroborationScore * 0.15)
           + (completenessScore * 0.15)
```

Where:
- `entityMatchAvgConfidence`: average of `entityMatchConfidences` values from the ExtractedEvent
- `extractionMethodScore`: 100 if deterministic, 80 if model_assisted
- `corroborationScore`: 60 for 1 source, 80 for 2, 100 for 3+
- `completenessScore`: (required fields populated / total required fields) * 100

### 5. Source Authority (default weight: 10%)

**What it measures:** How authoritative is the source that originated this information?

**Computation (deterministic):** Directly from the `sourceAuthority` field on the Source entity. This is an admin-assigned score.

| Source Type (examples) | Typical Authority Score |
|---|---|
| Company's own IR/press release page | 90–100 |
| Official regulatory filing (SEC, CONSOB, etc.) | 95–100 |
| Major financial news service (Bloomberg, Reuters) | 80–90 |
| Industry trade publication | 65–80 |
| General news outlet | 50–65 |
| Blog/analysis site | 30–50 |
| Aggregator or scraper | 20–30 |

If a signal is backed by multiple source contents, source authority uses the maximum authority score among them (best source wins).

---

## Composite Score Computation

```
compositeScore = round(
    relevance * weight_relevance
  + impact * weight_impact
  + freshness * weight_freshness
  + confidence * weight_confidence
  + sourceAuthority * weight_sourceAuthority
)
```

**Default weights:**

| Dimension | Weight |
|---|---|
| Relevance | 0.30 |
| Impact | 0.25 |
| Freshness | 0.20 |
| Confidence | 0.15 |
| Source Authority | 0.10 |
| **Total** | **1.00** |

Weights are stored on the Workspace document and can be adjusted by admins. The weights MUST sum to 1.00. The API validates this constraint on update.

### Worked Example

Signal: "Enel awarded 800 MW wind farm contract in Brazil" from Enel's IR page.

| Dimension | Value | Weight | Contribution |
|---|---|---|---|
| Relevance | 92 (competitor, high match confidence) | 0.30 | 27.6 |
| Impact | 80 (project_award base) + 5 (competitor) = 85 | 0.25 | 21.3 |
| Freshness | 100 (detected 2 hours ago) | 0.20 | 20.0 |
| Confidence | 95 (deterministic extraction, all fields populated) | 0.15 | 14.3 |
| Source Authority | 95 (company IR page) | 0.10 | 9.5 |
| **Composite** | | | **93** |

This signal scores 93/100 — critical priority, exactly as expected for a major competitor winning a large project award.

---

## Weight Variation by Context

### By Signal Type
Some organizations may want to weight signal types differently. For example, a company heavily focused on M&A might boost the impact weight for `ma_divestment` signals.

**MVP approach:** The workspace-level weight configuration applies uniformly. Per-signal-type weight overrides are post-MVP.

### By Watchlist Role
A user's watchlist might prioritize competitors over general industry entities. This is handled by the relevance dimension (competitor entities score higher in relevance), not by weight overrides.

**MVP approach:** No per-watchlist weight overrides. The relevance dimension's entity-role-based scoring provides sufficient differentiation.

---

## Tie-Breaking and Ranking

When multiple signals have the same composite score, the dashboard must still show them in a deterministic order.

**Tie-breaking rules (in order):**
1. **Higher impact score first.** Between two signals with composite 75, the one with a more significant event type wins.
2. **More recent detectedAt first.** Between two signals with the same impact, the newer one wins.
3. **Alphabetical by signalId.** Deterministic fallback for identical timestamps.

---

## Explainability

Every signal stored in Firestore and BigQuery includes the full scoring breakdown:

```
scores: {
  relevance: 92,
  impact: 85,
  freshness: 100,
  confidence: 95,
  sourceAuthority: 95,
  weights: {
    relevance: 0.30,
    impact: 0.25,
    freshness: 0.20,
    confidence: 0.15,
    sourceAuthority: 0.10
  }
}
compositeScore: 93
```

The dashboard CAN (and eventually should) render these dimensions visually (e.g., a radar chart or bar breakdown) so users understand why a signal ranked where it did.

The API exposes the `scores` object on every signal response. Agent tools can access and reason about individual dimensions.

---

## Deterministic vs Model-Assisted Scoring

**The entire scoring model is deterministic for MVP.**

No LLM is involved in score computation. Every dimension has a formulaic derivation from structured data (entity match confidence, signal type, timestamp, source authority, extraction metadata).

**Where model-assisted scoring may be added post-MVP:**
- **Sentiment analysis:** An LLM could assess whether a signal is positive/negative for the organization. This would be a new dimension, not a replacement of existing ones.
- **Strategic relevance:** An LLM could assess whether a signal aligns with the organization's stated strategic priorities. Again, additive.

If model-assisted dimensions are added:
1. They MUST be stored as separate dimension scores alongside the deterministic ones.
2. The composite score formula MUST remain transparent (just add a new weighted term).
3. The default path MUST work without them (they have a default value of 50 — neutral — when the model is unavailable).

---

## Anti-Gaming and Anti-Noise Principles

### Anti-Noise

1. **Commodity movement threshold.** Commodity signals below a configurable volatility threshold do not produce signals. The default threshold is ±5% daily change or ±10% weekly change.
2. **Boilerplate filter.** Source content changes that are flagged as non-substantive (cookie banners, footer updates, layout changes) produce `extractionStatus: 'skipped'` and no events.
3. **Dedup window.** Signals within the dedup window (72h) that match the same entity + type are suppressed or marked as `novelty: 'update'`. This prevents 10 sources reporting the same news from generating 10 separate signals.
4. **Minimum confidence floor.** Events with overall `confidence < 30` do not produce signals. They are stored in BigQuery for audit but do not enter the Firestore read model.

### Anti-Gaming

"Gaming" in this context means the scoring model producing misleading results due to pathological inputs.

1. **Source authority is admin-assigned, not auto-computed.** A malicious or low-quality source cannot self-assign a high authority score.
2. **Entity match confidence is capped.** Even a perfect alias match caps at 95 confidence (not 100) unless it's an exact external ID match. This prevents adversarial alias injection from creating artificially high-confidence matches.
3. **Impact scores have ceilings per signal type.** A `commodity_movement` signal cannot score above 80 on impact regardless of modifiers. This prevents commodity noise from dominating the dashboard.
4. **Freshness recalculation at read time** prevents stale signals from maintaining artificially high freshness scores if they were scored once and cached indefinitely.
5. **Composite score is always recomputable.** If scoring logic changes, all active signals in Firestore can be re-scored from their stored dimension inputs. The pipeline can replay from BigQuery for historical re-scoring.

---

## Score Recalculation

Signals are scored once at creation time by `services/intel`. However, scores may need recalculation:

1. **Freshness decay:** Freshness changes with time. The API may apply a freshness adjustment at read time, or a periodic batch job may update Firestore signals' freshness scores.
2. **Weight changes:** If an admin changes workspace scoring weights, all active signals should be re-scored. This is a batch operation triggered by the API, running as a Cloud Task.
3. **Entity changes:** If an entity's role changes (e.g., `partner` → `competitor`), signals linked to that entity may need relevance re-scoring.

**MVP approach:** Score recalculation for freshness is done at read time by the API (compute freshness from `signalTime` and current time, apply weights). The `compositeScore` stored in Firestore is the score at `scoredAt`. The API response includes both `storedCompositeScore` (from Firestore) and `currentCompositeScore` (with freshness adjustment).

Full re-scoring on weight changes is a batch operation. Admin changes to weights trigger a Cloud Task that re-scores all active signals.
