import type { LatestSignalDocument } from '@signal/contracts';
import { describe, expect, it } from 'vitest';
import {
  BRIEF_SELECTION,
  effectiveBriefSignalWindow,
  filterByEntityType,
  selectSignalsForBrief,
} from './select-brief-signals';

function sig(
  id: string,
  score: number,
  detectedAt: Date,
  entityRefs: LatestSignalDocument['entityRefs'],
): LatestSignalDocument {
  return {
    signalId: id,
    signalType: 't',
    title: id,
    entityRefs,
    score,
    status: 'active',
    occurredAt: detectedAt,
    detectedAt,
    updatedAt: detectedAt,
  };
}

describe('effectiveBriefSignalWindow', () => {
  it('intersects UTC reporting day with lookback from now (never before periodStart)', () => {
    const periodStart = new Date(Date.UTC(2026, 3, 5, 0, 0, 0, 0));
    const periodEnd = new Date(Date.UTC(2026, 3, 5, 23, 59, 59, 999));
    const now = new Date(Date.UTC(2026, 3, 5, 8, 0, 0, 0));
    const lookbackStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const { windowStart, windowEnd } = effectiveBriefSignalWindow({
      periodStart,
      periodEnd,
      lookbackHours: 24,
      now,
    });
    expect(windowStart.toISOString()).toBe(
      new Date(Math.max(periodStart.getTime(), lookbackStart.getTime())).toISOString(),
    );
    expect(windowEnd.toISOString()).toBe(now.toISOString());
  });
});

describe('selectSignalsForBrief', () => {
  const day = new Date(Date.UTC(2026, 3, 5, 12, 0, 0, 0));
  const periodStart = new Date(Date.UTC(2026, 3, 5, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(2026, 3, 5, 23, 59, 59, 999));

  it('board_digest uses higher score floor and smaller cap than daily_workspace', () => {
    const signals = [
      sig('a', 70, day, [{ entityType: 'competitor', entityId: 'x' }]),
      sig('b', 66, day, [{ entityType: 'competitor', entityId: 'y' }]),
      sig('mid', 60, day, [{ entityType: 'competitor', entityId: 'mid' }]),
      sig('c', 40, day, [{ entityType: 'competitor', entityId: 'z' }]),
    ];
    const daily = selectSignalsForBrief({
      signals,
      briefType: 'daily_workspace',
      periodStart,
      periodEnd,
      lookbackHours: 48,
      now: day,
    });
    const board = selectSignalsForBrief({
      signals,
      briefType: 'board_digest',
      periodStart,
      periodEnd,
      lookbackHours: 48,
      now: day,
    });
    expect(daily.map((s) => s.signalId)).toEqual(['a', 'b', 'mid']);
    expect(board.map((s) => s.signalId)).toEqual(['a', 'b']);
  });

  it('sorts by score descending before capping', () => {
    const signals = [sig('low', 90, day, []), sig('high', 95, day, [])];
    const out = selectSignalsForBrief({
      signals,
      briefType: 'daily_workspace',
      periodStart,
      periodEnd,
      lookbackHours: 48,
      now: day,
    });
    expect(out.map((s) => s.signalId)).toEqual(['high', 'low']);
  });

  it('exposes explicit caps in BRIEF_SELECTION', () => {
    expect(BRIEF_SELECTION.daily_workspace.maxTotal).toBeGreaterThan(
      BRIEF_SELECTION.board_digest.maxTotal,
    );
    expect(BRIEF_SELECTION.board_digest.minScore).toBeGreaterThan(
      BRIEF_SELECTION.daily_workspace.minScore,
    );
  });
});

describe('filterByEntityType', () => {
  const day = new Date(Date.UTC(2026, 3, 5, 12, 0, 0, 0));
  const signals = [
    sig('c', 80, day, [{ entityType: 'competitor', entityId: 'a' }]),
    sig('d', 70, day, [{ entityType: 'client', entityId: 'b' }]),
  ];

  it('limits per section', () => {
    expect(filterByEntityType(signals, 'competitor', 1).map((s) => s.signalId)).toEqual(['c']);
  });
});
