import { describe, expect, it } from 'vitest';
import { SourceRegistryDocumentSchema, SourceTypeSchema } from '../source-registry';

describe('SourceRegistryDocumentSchema', () => {
  it('accepts a minimal valid document', () => {
    const parsed = SourceRegistryDocumentSchema.safeParse({
      sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      name: 'Test',
      canonicalUrl: 'https://example.com',
      sourceType: 'web_page',
      category: 'general_market',
      isActive: true,
      authorityScore: 50,
      priorityTier: 'p3_low',
      fetchStrategy: {
        fetchMethodHint: 'html',
        checkFrequencyBucket: 'weekly',
        etagSupport: 'none',
        authRequired: false,
      },
      parserStrategy: { parserStrategyKey: 'html_generic' },
      linkedEntityRefs: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sourceType).toBe('web_page');
    }
  });

  it('rejects invalid sourceType', () => {
    const parsed = SourceRegistryDocumentSchema.safeParse({
      sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      name: 'Test',
      canonicalUrl: 'https://example.com',
      sourceType: 'not_a_type',
      category: 'general_market',
      isActive: true,
      authorityScore: 50,
      priorityTier: 'p3_low',
      fetchStrategy: {
        fetchMethodHint: 'html',
        checkFrequencyBucket: 'weekly',
        etagSupport: 'none',
        authRequired: false,
      },
      parserStrategy: { parserStrategyKey: 'html_generic' },
      linkedEntityRefs: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(parsed.success).toBe(false);
  });

  it('coerces ISO date strings (fixture-style shape)', () => {
    const parsed = SourceRegistryDocumentSchema.safeParse({
      sourceId: '8c9e4470-8f4a-4a3f-9c2d-1b2a3c4d5e6f',
      name: 'Fixture',
      canonicalUrl: 'https://example.gov/feed.xml',
      sourceType: 'regulatory_feed',
      category: 'policy_regulatory',
      isActive: true,
      authorityScore: 90,
      priorityTier: 'p1_high',
      fetchStrategy: {
        fetchMethodHint: 'rss',
        checkFrequencyBucket: 'hourly',
        etagSupport: 'expected',
        authRequired: false,
      },
      parserStrategy: {
        parserStrategyKey: 'regulatory_filing_generic',
        contentLanguageHint: 'it',
        expectedContentKind: 'rss_xml',
      },
      linkedEntityRefs: [],
      createdAt: '2026-02-01T09:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.createdAt).toBeInstanceOf(Date);
    }
  });
});

describe('SourceTypeSchema', () => {
  it('lists MVP source types', () => {
    expect(SourceTypeSchema.options).toContain('regulatory_feed');
    expect(SourceTypeSchema.options).toContain('json_api');
  });
});
