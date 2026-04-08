import type { MapSignalPointV1 } from '@signal/contracts';
import { describe, expect, it } from 'vitest';
import {
  formatRegionKeyLabel,
  groupByRegionKey,
  isUnplacedRegionKey,
  partitionMapPoints,
  sortedRegionKeys,
} from './partition-map-points';

const base = (over: Partial<MapSignalPointV1>): MapSignalPointV1 => ({
  signalId: 's1',
  signalType: 'project_award',
  title: 'T',
  status: 'active',
  occurredAt: '2026-04-01T10:00:00.000Z',
  detectedAt: '2026-04-01T12:00:00.000Z',
  ...over,
});

describe('partitionMapPoints', () => {
  it('splits coordinate vs non-coordinate points', () => {
    const a = base({ signalId: 'a', lat: 45, lng: 9, regionKey: 'x:1' });
    const b = base({ signalId: 'b', regionKey: 'x:1' });
    const c = base({ signalId: 'c' });
    const { withCoords, withoutCoords } = partitionMapPoints([a, b, c]);
    expect(withCoords).toEqual([a]);
    expect(withoutCoords.map((p) => p.signalId)).toEqual(['b', 'c']);
  });

  it('treats partial lat/lng as without coords', () => {
    const p = base({ signalId: 'a', lat: 1 });
    expect(partitionMapPoints([p]).withCoords).toHaveLength(0);
  });
});

describe('groupByRegionKey', () => {
  it('groups and sorts by detectedAt desc within group', () => {
    const p1 = base({
      signalId: 'old',
      regionKey: 'org:a',
      detectedAt: '2026-04-01T10:00:00.000Z',
    });
    const p2 = base({
      signalId: 'new',
      regionKey: 'org:a',
      detectedAt: '2026-04-02T10:00:00.000Z',
    });
    const g = groupByRegionKey([p1, p2]);
    expect(g.get('org:a')?.map((p) => p.signalId)).toEqual(['new', 'old']);
  });

  it('buckets missing regionKey together', () => {
    const p = base({ signalId: 'u' });
    const g = groupByRegionKey([p]);
    const keys = sortedRegionKeys(g);
    expect(keys).toHaveLength(1);
    expect(isUnplacedRegionKey(keys[0] ?? '')).toBe(true);
    expect(formatRegionKeyLabel(keys[0] ?? '')).toBe('No region anchor');
  });
});
