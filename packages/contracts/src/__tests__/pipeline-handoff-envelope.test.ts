import { describe, expect, it } from 'vitest';
import { parseSourceContentPersistedForIntel } from '../pipeline-handoff-envelope';
import { buildSourceContentPersistedEventV1 } from '../source-content-persisted-event';

describe('parseSourceContentPersistedForIntel', () => {
  const flat = buildSourceContentPersistedEventV1({
    sourceContentId: 'a'.repeat(32),
    sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    registrySourceType: 'rss_feed',
    contentRecordType: 'rss_entry',
    sourceUrl: 'https://example.com',
    observedAt: new Date('2026-01-01T00:00:00.000Z'),
    archivedGcsUri: 'gs://b/raw',
    manifestGcsUri: 'gs://b/m',
    contentHash: 'ab'.repeat(32),
    mimeType: 'application/xml',
    language: null,
    workspaceId: null,
    publishedAt: null,
  });

  it('parses bare SourceContentPersistedEvent', () => {
    const r = parseSourceContentPersistedForIntel(flat);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.sourceContentId).toBe(flat.sourceContentId);
    expect(r.envelope).toBeNull();
  });

  it('parses v1 envelope', () => {
    const r = parseSourceContentPersistedForIntel({
      schemaVersion: 'signal.pipeline.handoff.v1',
      idempotencyKey: 'k'.repeat(32),
      correlationId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      sourceContentPersisted: flat,
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.envelope?.correlationId).toBe('3fa85f64-5717-4562-b3fc-2c963f66afa6');
    expect(r.data.sourceContentId).toBe(flat.sourceContentId);
  });
});
