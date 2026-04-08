import { deriveSourceContentId } from '@signal/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { archiveSourceContentAndPersistRow } from './archive-source-content';

const saveMock = vi.fn().mockResolvedValue(undefined);
const insertMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket() {
      return {
        file: () => ({ save: saveMock }),
      };
    }
  },
}));

vi.mock('@google-cloud/bigquery', () => ({
  BigQuery: class {
    dataset() {
      return {
        table: () => ({ insert: insertMock }),
      };
    }
  },
}));

describe('archiveSourceContentAndPersistRow', () => {
  beforeEach(() => {
    saveMock.mockClear();
    insertMock.mockClear();
  });

  it('uploads twice and inserts one BigQuery row', async () => {
    const config = {
      firebaseProjectId: 'p',
      gcsRawBucketName: 'b',
      bigQueryDatasetId: 'd',
      bigQuerySourceContentsTableId: 'source_contents',
      defaultWorkspaceId: null as string | null,
    } as const;

    const source = {
      sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      name: 'S',
      canonicalUrl: 'https://example.com',
      sourceType: 'web_page' as const,
      category: 'general_market' as const,
      isActive: true,
      authorityScore: 50,
      priorityTier: 'p3_low' as const,
      fetchStrategy: {
        fetchMethodHint: 'html' as const,
        checkFrequencyBucket: 'weekly' as const,
        etagSupport: 'none' as const,
        authRequired: false,
      },
      parserStrategy: { parserStrategyKey: 'html_generic' as const },
      linkedEntityRefs: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const fp = `${'ab'.repeat(32)}`;
    const res = await archiveSourceContentAndPersistRow({
      config: config as never,
      source,
      rawBody: new TextEncoder().encode('<html/>').buffer,
      contentFingerprintHex: fp,
      observedAt: new Date('2026-04-04T12:00:00.000Z'),
      contentType: 'text/html',
      publishedAt: null,
    });

    expect(res.archivedGcsUri.startsWith('gs://b/raw/source/')).toBe(true);
    expect(res.manifestGcsUri.startsWith('gs://b/manifests/source/')).toBe(true);
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(insertMock).toHaveBeenCalledTimes(1);

    const expectedContentId = deriveSourceContentId(source.sourceId, fp);
    expect(res.sourceContentId).toBe(expectedContentId);

    const inserted = insertMock.mock.calls[0]?.[0] as unknown[];
    expect(Array.isArray(inserted)).toBe(true);
    const row = inserted?.[0] as Record<string, unknown>;
    expect(row.source_content_id).toBe(expectedContentId);
    expect(row.registry_source_type).toBe('web_page');
    expect(row.source_type).toBe('web_page');
    expect(row.mime_type).toBe('text/html');
  });
});
