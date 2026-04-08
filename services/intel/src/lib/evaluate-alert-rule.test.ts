import type { AlertCondition, LatestSignalDocument } from '@signal/contracts';
import { describe, expect, it } from 'vitest';
import { evaluateRuleAgainstSignal, parseRuleConditions } from './evaluate-alert-rule';

function baseSignal(over: Partial<LatestSignalDocument> = {}): LatestSignalDocument {
  return {
    signalId: 's1',
    signalType: 'project_award',
    title: 'Acme wins contract in Middle East',
    shortSummary: 'Large EPC award for upstream gas',
    entityRefs: [{ entityType: 'competitor', entityId: 'acme' }],
    score: 78,
    status: 'active',
    novelty: 'new',
    occurredAt: new Date('2026-04-01'),
    detectedAt: new Date('2026-04-02'),
    updatedAt: new Date('2026-04-02'),
    ...over,
  };
}

describe('parseRuleConditions', () => {
  it('parses valid conditions', () => {
    const c = parseRuleConditions({ signalType: 'ma_divestment', minScore: 50 });
    expect(c).toEqual({ signalType: 'ma_divestment', minScore: 50 });
  });

  it('returns null for invalid conditions', () => {
    expect(parseRuleConditions({ signalType: 'bogus' })).toBeNull();
  });

  it('returns empty object for empty conditions (all-pass)', () => {
    expect(parseRuleConditions({})).toEqual({});
  });
});

describe('evaluateRuleAgainstSignal', () => {
  it('matches when all conditions pass', () => {
    const r = evaluateRuleAgainstSignal(
      { signalType: 'project_award', minScore: 70, novelty: 'new' },
      baseSignal(),
    );
    expect(r.matched).toBe(true);
    expect(r.reasonCode).toBeNull();
  });

  it('empty conditions always match', () => {
    expect(evaluateRuleAgainstSignal({}, baseSignal()).matched).toBe(true);
  });

  it('rejects on signalType mismatch', () => {
    const r = evaluateRuleAgainstSignal({ signalType: 'ma_divestment' }, baseSignal());
    expect(r.matched).toBe(false);
    expect(r.reasonCode).toBe('signalType_mismatch');
  });

  it('rejects when score below threshold', () => {
    const r = evaluateRuleAgainstSignal({ minScore: 80 }, baseSignal({ score: 75 }));
    expect(r.matched).toBe(false);
    expect(r.reasonCode).toBe('score_below_threshold');
  });

  it('rejects on novelty mismatch', () => {
    const r = evaluateRuleAgainstSignal({ novelty: 'update' }, baseSignal({ novelty: 'new' }));
    expect(r.matched).toBe(false);
    expect(r.reasonCode).toBe('novelty_mismatch');
  });

  it('matches entityRef when present', () => {
    const r = evaluateRuleAgainstSignal(
      { entityRef: { entityType: 'competitor', entityId: 'acme' } },
      baseSignal(),
    );
    expect(r.matched).toBe(true);
  });

  it('rejects when entityRef not linked', () => {
    const r = evaluateRuleAgainstSignal(
      { entityRef: { entityType: 'competitor', entityId: 'other' } },
      baseSignal(),
    );
    expect(r.matched).toBe(false);
    expect(r.reasonCode).toBe('entityRef_not_linked');
  });

  it('matches keyword in title (case-insensitive)', () => {
    const r = evaluateRuleAgainstSignal({ keyword: 'Middle East' }, baseSignal());
    expect(r.matched).toBe(true);
  });

  it('matches keyword in shortSummary', () => {
    const r = evaluateRuleAgainstSignal({ keyword: 'upstream gas' }, baseSignal());
    expect(r.matched).toBe(true);
  });

  it('rejects when keyword not found', () => {
    const r = evaluateRuleAgainstSignal({ keyword: 'solar' }, baseSignal());
    expect(r.matched).toBe(false);
    expect(r.reasonCode).toBe('keyword_not_found');
  });

  it('short-circuits on first failing condition (AND)', () => {
    const c: AlertCondition = { signalType: 'ma_divestment', minScore: 50 };
    const r = evaluateRuleAgainstSignal(c, baseSignal());
    expect(r.matched).toBe(false);
    expect(r.reasonCode).toBe('signalType_mismatch');
  });
});
