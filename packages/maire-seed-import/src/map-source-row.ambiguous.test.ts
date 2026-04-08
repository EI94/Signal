import { describe, expect, it } from 'vitest';
import { mapSourceRowToRegistry } from './map-source-row';

describe('mapSourceRowToRegistry ambiguous tokens', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  it('fails row when linkedEntityRefs token is ambiguous', () => {
    const r = mapSourceRowToRegistry(
      {
        canonicalUrl: 'https://www.groupmaire.com/en/',
        sourceType: 'web_page',
        category: 'group_corporate',
        linkedEntityRefs: 'DUP',
        priorityTier: 'p0_critical',
        checkFrequencyBucket: 'weekly',
        authorityScore: '100',
        notes: '',
      },
      {
        createdBy: 'test',
        now,
        resolveEntityToken: (t: string) =>
          t === 'DUP'
            ? {
                ok: false,
                kind: 'ambiguous',
                detail: 'token "DUP" matches multiple entities: organization:A; organization:B',
              }
            : { ok: false, kind: 'not_found' },
      },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('linkedEntityRefs');
      expect(r.error).toContain('multiple entities');
    }
  });
});
