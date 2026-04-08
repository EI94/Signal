import { describe, expect, it } from 'vitest';
import {
  computeComposite,
  computeFreshness,
  computeImpact,
  computePipelineConfidenceScore,
  computeRelevance,
  SCORING_WEIGHTS,
  scoreSignalDeterministic,
} from './score-signal';

describe('scoreSignalDeterministic', () => {
  const base = {
    eventFamily: 'project_award' as const,
    extractionConfidence: 80,
    eventTime: new Date('2026-01-01T12:00:00Z'),
    observedAt: new Date('2026-01-01T14:00:00Z'),
    eventTimePrecision: 'day' as const,
    disclosedValueEurMillion: null,
    sourceAuthority: 70,
    extractedFactKeyCount: 3,
  };

  it('produces stable 0–100 dimensions and composite', () => {
    const a = scoreSignalDeterministic(base);
    const b = scoreSignalDeterministic(base);
    expect(a.composite).toBe(b.composite);
    expect(a.composite).toBeGreaterThanOrEqual(0);
    expect(a.composite).toBeLessThanOrEqual(100);
    expect(a.dimensions.relevance).toBe(computeRelevance({ extractionConfidence: 80 }));
    expect(a.dimensions.impact).toBe(computeImpact(base));
  });

  it('weights sum to 1', () => {
    const s =
      SCORING_WEIGHTS.relevance +
      SCORING_WEIGHTS.impact +
      SCORING_WEIGHTS.freshness +
      SCORING_WEIGHTS.confidence +
      SCORING_WEIGHTS.sourceAuthority;
    expect(s).toBeCloseTo(1, 5);
  });

  it('uses higher impact for ma_divestment than technology_milestone', () => {
    const t = {
      ...base,
      eventFamily: 'technology_milestone' as const,
    };
    expect(computeImpact({ ...base, eventFamily: 'ma_divestment' })).toBeGreaterThan(
      computeImpact(t),
    );
  });

  it('freshness is lower when event is older relative to observedAt', () => {
    const recent = computeFreshness({
      ...base,
      eventTime: new Date('2026-01-01T13:00:00Z'),
      observedAt: new Date('2026-01-01T14:00:00Z'),
    });
    const old = computeFreshness({
      ...base,
      eventTime: new Date('2025-01-01T12:00:00Z'),
      observedAt: new Date('2026-01-01T14:00:00Z'),
    });
    expect(recent).toBeGreaterThan(old);
  });

  it('composite matches weighted sum', () => {
    const dim = {
      relevance: 60,
      impact: 70,
      freshness: 80,
      confidence: 90,
      sourceAuthority: 50,
    };
    expect(computeComposite(dim)).toBe(
      Math.round(
        dim.relevance * SCORING_WEIGHTS.relevance +
          dim.impact * SCORING_WEIGHTS.impact +
          dim.freshness * SCORING_WEIGHTS.freshness +
          dim.confidence * SCORING_WEIGHTS.confidence +
          dim.sourceAuthority * SCORING_WEIGHTS.sourceAuthority,
      ),
    );
  });

  it('pipeline confidence uses extraction confidence and fact keys', () => {
    const low = computePipelineConfidenceScore({ ...base, extractedFactKeyCount: 0 });
    const high = computePipelineConfidenceScore({ ...base, extractedFactKeyCount: 5 });
    expect(high).toBeGreaterThanOrEqual(low);
  });
});
