import { describe, expect, it } from 'vitest';
import { IngestFetchRecordSchema, IngestRunOnceResponseSchema } from '../ingest-fetch-outcome';

describe('IngestFetchRecordSchema', () => {
  it('parses a valid record', () => {
    const r = IngestFetchRecordSchema.safeParse({
      sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      fetchedAt: '2026-04-04T12:00:00.000Z',
      deltaOutcome: 'changed',
      httpStatusCode: 200,
      contentType: 'text/html',
      etag: '"x"',
      lastModified: null,
      contentHash: 'abc'.repeat(10).slice(0, 64),
      byteLength: 4,
    });
    expect(r.success).toBe(true);
  });
});

describe('IngestRunOnceResponseSchema', () => {
  it('parses success response', () => {
    const r = IngestRunOnceResponseSchema.safeParse({
      ok: true,
      runAt: '2026-04-04T12:00:00.000Z',
      summary: {
        processed: 1,
        unchanged: 0,
        changed: 1,
        firstSeen: 0,
        failed: 0,
        skipped: 0,
        archived: 1,
        persisted: 1,
        persistSkipped: 0,
        persistFailed: 0,
        published: 0,
        publishFailed: 0,
        publishSkipped: 1,
        skippedRatePolicy: 0,
        maxSourcesPerRunApplied: null,
        sourcesOmittedByCap: 0,
      },
    });
    expect(r.success).toBe(true);
  });
});
