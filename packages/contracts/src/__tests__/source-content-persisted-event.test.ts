import { describe, expect, it } from 'vitest';
import {
  buildSourceContentPersistedEventV1,
  SourceContentPersistedEventSchema,
} from '../source-content-persisted-event';

describe('SourceContentPersistedEventSchema', () => {
  it('accepts a minimal v1 payload', () => {
    const r = SourceContentPersistedEventSchema.safeParse({
      eventType: 'source_content.persisted',
      eventVersion: 'v1',
      sourceContentId: 'ab'.repeat(16),
      sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      registrySourceType: 'rss_feed',
      sourceType: 'rss_entry',
      sourceUrl: 'https://example.com/feed.xml',
      observedAt: '2026-04-04T12:00:00.000Z',
      archivedGcsUri: 'gs://b/raw/source/x',
      manifestGcsUri: 'gs://b/manifests/source/x',
      contentHash: 'cd'.repeat(32),
      mimeType: 'application/rss+xml',
      language: 'en',
      workspaceId: null,
      publishedAt: null,
      emittedAt: '2026-04-04T12:00:01.000Z',
    });
    expect(r.success).toBe(true);
  });
});

describe('buildSourceContentPersistedEventV1', () => {
  it('maps registry type to payload sourceType and timestamps', () => {
    const e = buildSourceContentPersistedEventV1({
      sourceContentId: 'ab'.repeat(16),
      sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      registrySourceType: 'web_page',
      contentRecordType: 'web_page',
      sourceUrl: 'https://example.com/',
      observedAt: new Date('2026-04-04T12:00:00.000Z'),
      archivedGcsUri: 'gs://b/raw/k',
      manifestGcsUri: 'gs://b/manifests/k',
      contentHash: 'ef'.repeat(32),
      mimeType: 'text/html',
      language: null,
      workspaceId: null,
      publishedAt: null,
      emittedAt: new Date('2026-04-04T12:00:02.000Z'),
    });
    expect(e.eventType).toBe('source_content.persisted');
    expect(e.sourceType).toBe('web_page');
    expect(e.registrySourceType).toBe('web_page');
    expect(e.emittedAt).toBe('2026-04-04T12:00:02.000Z');
  });
});
