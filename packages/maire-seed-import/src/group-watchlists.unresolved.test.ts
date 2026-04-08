import { describe, expect, it } from 'vitest';
import { buildWatchlistDocument } from './group-watchlists';

describe('buildWatchlistDocument unresolved rows', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  it('returns rowFailures when an entity cannot be resolved', () => {
    const r = buildWatchlistDocument({
      workspaceId: 'ws1',
      watchlistName: 'Radar',
      rows: [
        {
          watchlistName: 'Radar',
          entityType: 'organization',
          entityIdOrCanonicalName: 'Nope',
          priority: 'P0',
          sourceRowNumber: 5,
        },
      ],
      resolve: () => ({ ok: false, kind: 'not_found' }),
      createdBy: 'seed',
      now,
    });
    expect(r.ok).toBe(false);
    if (!r.ok && 'rowFailures' in r) {
      expect(r.rowFailures.length).toBe(1);
      expect(r.rowFailures[0]?.detail).toContain('unresolved');
      expect(r.rowFailures[0]?.detail).toContain('CSV row 5');
    } else {
      throw new Error('expected rowFailures');
    }
  });

  it('does not add unresolved hints only in description', () => {
    const r = buildWatchlistDocument({
      workspaceId: 'ws1',
      watchlistName: 'Radar',
      rows: [
        {
          watchlistName: 'Radar',
          entityType: 'organization',
          entityIdOrCanonicalName: 'Ghost',
          priority: 'P0',
          sourceRowNumber: 2,
        },
      ],
      resolve: () => ({ ok: false, kind: 'not_found' }),
      createdBy: 'seed',
      now,
    });
    expect(r.ok).toBe(false);
  });
});
