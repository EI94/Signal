import { describe, expect, it } from 'vitest';
import { mapLatestToSignalSummaryV1 } from './signal-summary-mapper';

function baseDoc(overrides: Partial<import('@signal/contracts').LatestSignalDocument> = {}) {
  const now = new Date('2026-04-01T12:00:00.000Z');
  return {
    signalId: 's1',
    signalType: 'project_award',
    title: 'T',
    shortSummary: undefined,
    entityRefs: [{ entityType: 'org', entityId: 'o1' }],
    score: 80,
    status: 'active',
    novelty: 'high',
    occurredAt: now,
    detectedAt: now,
    updatedAt: now,
    ...overrides,
  } satisfies import('@signal/contracts').LatestSignalDocument;
}

describe('mapLatestToSignalSummaryV1', () => {
  it('maps a valid MVP signal', () => {
    const s = mapLatestToSignalSummaryV1(baseDoc());
    expect(s).not.toBeNull();
    expect(s?.signalType).toBe('project_award');
    expect(s?.compositeScore).toBe(80);
    expect(s?.occurredAt).toMatch(/^\d{4}-/);
  });

  it('returns null when signalType is not in MVP enum', () => {
    const s = mapLatestToSignalSummaryV1(baseDoc({ signalType: 'unknown_future_type' }));
    expect(s).toBeNull();
  });

  it('clamps composite score to 0–100', () => {
    const s = mapLatestToSignalSummaryV1(baseDoc({ score: 999 }));
    expect(s?.compositeScore).toBe(100);
    const s2 = mapLatestToSignalSummaryV1(baseDoc({ score: -5 }));
    expect(s2?.compositeScore).toBe(0);
  });
});
