/**
 * Deterministic scoring (WS5.2) — weights from docs/architecture/scoring-model-v1.md.
 * No LLM; all dimensions are integers 0–100; composite is rounded.
 */

import type { ExtractedEventFamilyMvp } from '@signal/contracts';

export const SCORING_WEIGHTS = {
  relevance: 0.3,
  impact: 0.25,
  freshness: 0.2,
  confidence: 0.15,
  sourceAuthority: 0.1,
} as const;

/** Base impact by signal type (same names as event_family in MVP). */
const IMPACT_BASE: Record<ExtractedEventFamilyMvp, number> = {
  ma_divestment: 95,
  earnings_reporting_update: 85,
  project_award: 80,
  partnership_mou: 65,
  technology_milestone: 55,
};

export type ScoreDimensions = {
  relevance: number;
  impact: number;
  freshness: number;
  confidence: number;
  sourceAuthority: number;
};

export type ScoreSignalInput = {
  eventFamily: ExtractedEventFamilyMvp;
  /** ExtractedEvent.confidence (0–100), drives relevance + pipeline confidence dimension. */
  extractionConfidence: number | null;
  eventTime: Date;
  /** SourceContent observation time — “as of when” we score freshness. */
  observedAt: Date;
  eventTimePrecision: string | null;
  /** Optional monetary hint in extracted facts (EUR); +10 impact if above threshold. */
  disclosedValueEurMillion: number | null;
  /** Source authority dimension (0–100), usually from registry tier. */
  sourceAuthority: number;
  /** Number of populated keys in extracted_facts_json (completeness hint). */
  extractedFactKeyCount: number;
};

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Relevance — MVP without watchlists/roles: “tracked entities” band using extraction confidence. */
export function computeRelevance(params: { extractionConfidence: number | null }): number {
  const c = params.extractionConfidence ?? 60;
  return clamp100(50 + (c / 100) * 20);
}

export function computeImpact(input: ScoreSignalInput): number {
  let v = IMPACT_BASE[input.eventFamily];
  if (input.disclosedValueEurMillion !== null && input.disclosedValueEurMillion > 100) {
    v = Math.min(100, v + 10);
  }
  return clamp100(v);
}

/**
 * Freshness from hours between event and observation (scoring-model v1 table).
 * Quarter/year precision uses slower decay (thresholds doubled).
 */
export function computeFreshness(input: ScoreSignalInput): number {
  const hours = Math.max(
    0,
    (input.observedAt.getTime() - input.eventTime.getTime()) / (1000 * 60 * 60),
  );
  const slow = input.eventTimePrecision === 'quarter' || input.eventTimePrecision === 'year';
  const h = slow ? hours / 2 : hours;

  if (h <= 6) return 100;
  if (h <= 24) return 85;
  if (h <= 72) return 65;
  if (h <= 24 * 7) return 40;
  if (h <= 24 * 14) return 25;
  if (h <= 24 * 30) return 15;
  return 5;
}

/**
 * Pipeline “confidence” dimension (distinct from extraction confidence scalar) — formula from scoring-model v1.
 */
export function computePipelineConfidenceScore(input: ScoreSignalInput): number {
  const entityMatchAvg = input.extractionConfidence ?? 60;
  const extractionMethodScore = 100;
  const corroborationScore = 60;
  const completenessScore =
    input.extractedFactKeyCount >= 3 ? 90 : input.extractedFactKeyCount >= 1 ? 75 : 60;

  const raw =
    entityMatchAvg * 0.4 +
    extractionMethodScore * 0.3 +
    corroborationScore * 0.15 +
    completenessScore * 0.15;

  return clamp100(raw);
}

export function computeComposite(dim: ScoreDimensions): number {
  const x =
    dim.relevance * SCORING_WEIGHTS.relevance +
    dim.impact * SCORING_WEIGHTS.impact +
    dim.freshness * SCORING_WEIGHTS.freshness +
    dim.confidence * SCORING_WEIGHTS.confidence +
    dim.sourceAuthority * SCORING_WEIGHTS.sourceAuthority;
  return clamp100(x);
}

export function scoreSignalDeterministic(input: ScoreSignalInput): {
  dimensions: ScoreDimensions;
  composite: number;
} {
  const relevance = computeRelevance({ extractionConfidence: input.extractionConfidence });
  const impact = computeImpact(input);
  const freshness = computeFreshness(input);
  const confidence = computePipelineConfidenceScore(input);
  const sourceAuthority = clamp100(input.sourceAuthority);

  const dimensions: ScoreDimensions = {
    relevance,
    impact,
    freshness,
    confidence,
    sourceAuthority,
  };

  return { dimensions, composite: computeComposite(dimensions) };
}

/** Parse optional monetary hint from deterministic extractor facts. */
export function disclosedValueEurMillionFromFacts(
  facts: Record<string, unknown> | null,
): number | null {
  if (!facts) return null;
  const raw = facts.disclosedValueEurMillion;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  return null;
}
