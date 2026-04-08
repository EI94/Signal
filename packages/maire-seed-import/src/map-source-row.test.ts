import { describe, expect, it } from 'vitest';
import { mapSourceRowToRegistry } from './map-source-row';

describe('mapSourceRowToRegistry', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const ctx = {
    createdBy: 'test',
    now,
    resolveEntityToken: (t: string) =>
      t === 'MAIRE'
        ? {
            ok: true as const,
            ref: { entityType: 'organization', entityId: 'e1', displayName: 'MAIRE' },
          }
        : { ok: false as const, kind: 'not_found' as const },
  };

  it('maps a minimal web_page row', () => {
    const r = mapSourceRowToRegistry(
      {
        canonicalUrl: 'https://www.groupmaire.com/en/',
        sourceType: 'web_page',
        category: 'group_corporate',
        linkedEntityRefs: 'MAIRE',
        priorityTier: 'p0_critical',
        checkFrequencyBucket: 'weekly',
        authorityScore: '100',
        notes: 'Primary',
      },
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.doc.sourceType).toBe('web_page');
      expect(r.doc.linkedEntityRefs).toHaveLength(1);
      expect(r.doc.fetchStrategy.checkFrequencyBucket).toBe('weekly');
    }
  });

  it('maps monthly to weekly with note', () => {
    const r = mapSourceRowToRegistry(
      {
        canonicalUrl: 'https://example.com/a',
        sourceType: 'web_page',
        category: 'group_corporate',
        linkedEntityRefs: '',
        priorityTier: 'p0_critical',
        checkFrequencyBucket: 'monthly',
        authorityScore: '100',
        notes: 'x',
      },
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.doc.fetchStrategy.checkFrequencyBucket).toBe('weekly');
      expect(r.doc.notes).toContain('monthly');
    }
  });

  it('rejects unknown category', () => {
    const r = mapSourceRowToRegistry(
      {
        canonicalUrl: 'https://example.com/a',
        sourceType: 'web_page',
        category: 'not_a_category',
        linkedEntityRefs: '',
        priorityTier: 'p0_critical',
        checkFrequencyBucket: 'daily',
        authorityScore: '100',
        notes: '',
      },
      ctx,
    );
    expect(r.ok).toBe(false);
  });
});
