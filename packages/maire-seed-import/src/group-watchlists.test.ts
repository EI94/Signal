import { describe, expect, it } from 'vitest';
import { buildWatchlistDocument, groupWatchlistRows } from './group-watchlists';

describe('groupWatchlistRows', () => {
  it('groups by watchlist name', () => {
    const g = groupWatchlistRows([
      {
        watchlistName: 'A',
        entityType: 'organization',
        entityIdOrCanonicalName: 'X',
        priority: 'P0',
      },
      {
        watchlistName: 'A',
        entityType: 'organization',
        entityIdOrCanonicalName: 'Y',
        priority: 'P0',
      },
      {
        watchlistName: 'B',
        entityType: 'organization',
        entityIdOrCanonicalName: 'Z',
        priority: 'P0',
      },
    ]);
    expect(g.get('A')?.length).toBe(2);
    expect(g.get('B')?.length).toBe(1);
  });
});

describe('buildWatchlistDocument', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  it('dedupes entity refs', () => {
    const r = buildWatchlistDocument({
      workspaceId: 'ws1',
      watchlistName: 'Test',
      rows: [
        {
          watchlistName: 'Test',
          entityType: 'organization',
          entityIdOrCanonicalName: 'ADNOC',
          priority: 'P0',
        },
        {
          watchlistName: 'Test',
          entityType: 'organization',
          entityIdOrCanonicalName: 'ADNOC',
          priority: 'P0',
        },
      ],
      resolve: (et, tok) =>
        et === 'organization' && tok === 'ADNOC'
          ? {
              ok: true,
              ref: { entityType: 'organization', entityId: 'id1', displayName: 'ADNOC' },
            }
          : { ok: false, kind: 'not_found' },
      createdBy: 'seed',
      now,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.doc.entityRefs).toHaveLength(1);
    }
  });
});
