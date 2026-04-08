import { describe, expect, it } from 'vitest';
import { buildSignalsFeedFromWindow } from './signals-feed';

function doc(
  id: string,
  score: number,
  detected: string,
  signalType = 'project_award',
): import('@signal/contracts').LatestSignalDocument {
  const d = new Date(detected);
  return {
    signalId: id,
    signalType,
    title: id,
    entityRefs: [],
    score,
    status: 'active',
    occurredAt: d,
    detectedAt: d,
    updatedAt: d,
  };
}

describe('buildSignalsFeedFromWindow', () => {
  it('paginates with offset cursor deterministically', () => {
    const window = [
      doc('a', 10, '2026-04-03T12:00:00.000Z'),
      doc('b', 20, '2026-04-02T12:00:00.000Z'),
      doc('c', 30, '2026-04-01T12:00:00.000Z'),
    ];
    const q = { limit: 2, sort: 'detected_at_desc' as const };
    const p1 = buildSignalsFeedFromWindow(window, q);
    expect(p1.items).toHaveLength(2);
    const token = p1.nextPageToken;
    if (token === null) {
      throw new Error('expected nextPageToken');
    }
    const p2 = buildSignalsFeedFromWindow(window, { ...q, cursor: token });
    expect(p2.items).toHaveLength(1);
    expect(p2.nextPageToken).toBeNull();
  });

  it('filters by minScore', () => {
    const window = [
      doc('a', 10, '2026-04-01T12:00:00.000Z'),
      doc('b', 80, '2026-04-02T12:00:00.000Z'),
    ];
    const r = buildSignalsFeedFromWindow(window, {
      limit: 10,
      minScore: 50,
      sort: 'detected_at_desc',
    });
    expect(r.items.map((i) => i.signalId)).toEqual(['b']);
  });
});
