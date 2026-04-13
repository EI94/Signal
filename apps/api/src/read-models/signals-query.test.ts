import type { LatestSignalDocument } from '@signal/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildSignalsFeedFromWindow,
  computeSignalsFeedFacets,
  filterSignalsForFeed,
} from './signals-query';

function doc(id: string, overrides: Partial<LatestSignalDocument> = {}): LatestSignalDocument {
  const t = new Date('2026-04-01T12:00:00.000Z');
  return {
    signalId: id,
    signalType: 'project_award',
    title: id,
    entityRefs: [{ entityType: 'org', entityId: 'o1' }],
    score: 50,
    status: 'active',
    novelty: 'high',
    occurredAt: t,
    detectedAt: t,
    updatedAt: t,
    ...overrides,
  };
}

describe('filterSignalsForFeed', () => {
  it('filters by marketIndexTags (intersection)', () => {
    const window = [
      doc('a', { marketIndexTagIds: ['spx', 'ndx'] }),
      doc('b', { marketIndexTagIds: ['eurostoxx'] }),
      doc('c', {}),
    ];
    const q = {
      marketIndexTags: ['spx'],
      limit: 10,
      sort: 'detected_at_desc' as const,
    };
    const f = filterSignalsForFeed(window, q);
    expect(f.map((d) => d.signalId)).toEqual(['a']);
  });

  it('filters by entity ref', () => {
    const window = [
      doc('a', { entityRefs: [{ entityType: 'x', entityId: '1' }] }),
      doc('b', { entityRefs: [{ entityType: 'y', entityId: '2' }] }),
    ];
    const q = {
      entityType: 'x',
      entityId: '1',
      limit: 10,
      sort: 'detected_at_desc' as const,
    };
    const f = filterSignalsForFeed(window, q);
    expect(f.map((d) => d.signalId)).toEqual(['a']);
  });

  it('computes facets from filtered docs', () => {
    const window = [
      doc('a', { signalType: 'project_award', status: 's1', novelty: 'n1' }),
      doc('b', { signalType: 'partnership_mou', status: 's1', novelty: 'n2' }),
    ];
    const f = computeSignalsFeedFacets(window);
    expect(f.signalTypes.find((x) => x.value === 'project_award')?.count).toBe(1);
    expect(f.statuses.find((x) => x.value === 's1')?.count).toBe(2);
  });
});

describe('buildSignalsFeedFromWindow', () => {
  it('returns keyset nextPageToken when more pages exist', () => {
    const t0 = new Date('2026-04-03T12:00:00.000Z');
    const t1 = new Date('2026-04-02T12:00:00.000Z');
    const window = [doc('a', { detectedAt: t0 }), doc('b', { detectedAt: t1 })];
    const p1 = buildSignalsFeedFromWindow(window, { limit: 1, sort: 'detected_at_desc' });
    expect(p1.items).toHaveLength(1);
    expect(p1.nextPageToken).toBeTruthy();
    const p2 = buildSignalsFeedFromWindow(window, {
      limit: 1,
      sort: 'detected_at_desc',
      cursor: p1.nextPageToken ?? undefined,
    });
    expect(p2.items[0]?.signalId).toBe('b');
    expect(p2.nextPageToken).toBeNull();
  });
});
