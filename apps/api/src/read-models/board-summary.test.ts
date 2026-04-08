import { describe, expect, it } from 'vitest';
import { buildBoardSummaryFromWindow } from './board-summary';

describe('buildBoardSummaryFromWindow', () => {
  it('orders top signals by composite score', () => {
    const t0 = new Date('2026-04-01T10:00:00.000Z');
    const t1 = new Date('2026-04-01T11:00:00.000Z');
    const window = [
      {
        signalId: 'a',
        signalType: 'project_award',
        title: 'Low',
        entityRefs: [],
        score: 10,
        status: 'x',
        occurredAt: t0,
        detectedAt: t0,
        updatedAt: t0,
      },
      {
        signalId: 'b',
        signalType: 'partnership_mou',
        title: 'High',
        entityRefs: [],
        score: 90,
        status: 'x',
        occurredAt: t1,
        detectedAt: t1,
        updatedAt: t1,
      },
    ] as import('@signal/contracts').LatestSignalDocument[];

    const res = buildBoardSummaryFromWindow('ws', window);
    expect(res.workspaceId).toBe('ws');
    expect(res.topSignals[0]?.signalId).toBe('b');
    expect(res.topSignals[1]?.signalId).toBe('a');
  });

  it('drops non-MVP signal types from summaries', () => {
    const t = new Date('2026-04-01T10:00:00.000Z');
    const window = [
      {
        signalId: 'bad',
        signalType: 'not_an_mvp_enum',
        title: 'X',
        entityRefs: [],
        score: 100,
        status: 'x',
        occurredAt: t,
        detectedAt: t,
        updatedAt: t,
      },
    ] as import('@signal/contracts').LatestSignalDocument[];

    const res = buildBoardSummaryFromWindow('ws', window);
    expect(res.topSignals).toHaveLength(0);
  });
});
