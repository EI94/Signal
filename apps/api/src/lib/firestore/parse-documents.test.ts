import { describe, expect, it } from 'vitest';
import {
  parseFeatureFlagDocument,
  parseSourceRegistryDocument,
  parseWatchlistDocument,
} from './parse-documents';

describe('parse-documents', () => {
  it('parses watchlist when valid', () => {
    const r = parseWatchlistDocument({
      name: 'W',
      entityRefs: [{ entityType: 'company', entityId: 'c1' }],
      createdBy: 'u1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(r.success).toBe(true);
  });

  it('parses feature flag', () => {
    const r = parseFeatureFlagDocument({
      enabled: true,
      updatedAt: new Date(),
    });
    expect(r.success).toBe(true);
  });

  it('parses source registry document', () => {
    const r = parseSourceRegistryDocument({
      sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      name: 'S',
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(r.success).toBe(true);
  });
});
