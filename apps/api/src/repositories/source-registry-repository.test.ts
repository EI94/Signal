import type { SourceRegistryDocument } from '@signal/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  getSourceById,
  listActiveSources,
  listActiveSourcesByCategory,
  putSource,
} from './source-registry-repository';

function makeDoc(overrides?: Partial<SourceRegistryDocument>): SourceRegistryDocument {
  return {
    sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    name: 'Test source',
    canonicalUrl: 'https://example.com/feed',
    sourceType: 'web_page',
    category: 'competitor',
    isActive: true,
    authorityScore: 60,
    priorityTier: 'p2_standard',
    fetchStrategy: {
      fetchMethodHint: 'html',
      checkFrequencyBucket: 'daily',
      etagSupport: 'unknown',
      authRequired: false,
    },
    parserStrategy: { parserStrategyKey: 'html_generic', expectedContentKind: 'web_html' },
    linkedEntityRefs: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

describe('source-registry-repository', () => {
  it('getSourceById returns null when missing', async () => {
    const get = vi.fn(async () => ({ exists: false }));
    const db = {
      collection: vi.fn(() => ({ doc: vi.fn(() => ({ get })) })),
    };
    const out = await getSourceById(db as never, '3fa85f64-5717-4562-b3fc-2c963f66afa6');
    expect(out).toBeNull();
  });

  it('getSourceById returns parsed document when valid', async () => {
    const doc = makeDoc();
    const get = vi.fn(async () => ({ exists: true, data: () => ({ ...doc }) }));
    const db = {
      collection: vi.fn(() => ({ doc: vi.fn(() => ({ get })) })),
    };
    const out = await getSourceById(db as never, doc.sourceId);
    expect(out?.name).toBe('Test source');
  });

  it('getSourceById returns null when sourceId mismatches path', async () => {
    const doc = makeDoc({ sourceId: '11111111-1111-1111-1111-111111111111' });
    const get = vi.fn(async () => ({ exists: true, data: () => ({ ...doc }) }));
    const db = {
      collection: vi.fn(() => ({ doc: vi.fn(() => ({ get })) })),
    };
    const out = await getSourceById(db as never, '3fa85f64-5717-4562-b3fc-2c963f66afa6');
    expect(out).toBeNull();
  });

  it('listActiveSources filters and sorts by name', async () => {
    const a = makeDoc({ sourceId: '550e8400-e29b-41d4-a716-446655440001', name: 'B' });
    const b = makeDoc({ sourceId: '550e8400-e29b-41d4-a716-446655440002', name: 'A' });
    const get = vi.fn(async () => ({
      docs: [{ data: () => ({ ...a }) }, { data: () => ({ ...b }) }],
    }));
    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({ get })),
      })),
    };
    const out = await listActiveSources(db as never);
    expect(out.map((x) => x.name)).toEqual(['A', 'B']);
  });

  it('listActiveSourcesByCategory filters in memory', async () => {
    const competitor = makeDoc({
      sourceId: '550e8400-e29b-41d4-a716-446655440003',
      category: 'competitor',
    });
    const client = makeDoc({
      sourceId: '550e8400-e29b-41d4-a716-446655440004',
      category: 'client',
      name: 'Other',
    });
    const get = vi.fn(async () => ({
      docs: [{ data: () => ({ ...competitor }) }, { data: () => ({ ...client }) }],
    }));
    const db = {
      collection: vi.fn(() => ({
        where: vi.fn(() => ({ get })),
      })),
    };
    const out = await listActiveSourcesByCategory(db as never, 'competitor');
    expect(out).toHaveLength(1);
    expect(out[0]?.category).toBe('competitor');
  });

  it('putSource writes validated document', async () => {
    const set = vi.fn(async () => {});
    const doc = makeDoc();
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({ set })),
      })),
    };
    await putSource(db as never, doc);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('putSource throws on invalid document', async () => {
    const set = vi.fn(async () => {});
    const db = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({ set })),
      })),
    };
    const bad = { ...makeDoc(), authorityScore: 101 };
    await expect(putSource(db as never, bad as SourceRegistryDocument)).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
  });
});
