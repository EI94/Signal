import type { IngestRuntimeConfig } from '@signal/config';
import { describe, expect, it, vi } from 'vitest';

const { insertFn } = vi.hoisted(() => ({
  insertFn: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./insert-usage-metering-rows', () => ({
  insertUsageMeteringRows: insertFn,
}));

import { recordIngestRunCompleteMetering } from './record-usage-metering';

describe('recordIngestRunCompleteMetering', () => {
  const base: IngestRuntimeConfig = {
    serviceName: 'ingest',
    environment: 'development',
    port: 4001,
    logLevel: 'info',
    version: '0.0.0',
    isProduction: false,
    firebaseProjectId: 'proj',
    fetchTimeoutMs: 30_000,
    fetchMaxBodyBytes: 10 * 1024 * 1024,
    fetchUserAgent: 'ua',
    runOnceSecret: null,
    persistenceEnabled: true,
    gcsRawBucketName: 'b',
    bigQueryDatasetId: 'd',
    bigQuerySourceContentsTableId: 'sc',
    defaultWorkspaceId: 'ws',
    publishSourceContentEventsEnabled: false,
    pubsubTopicSourceContentPersisted: 't',
    pipelineHandoffEnvelopeEnabled: true,
    usageMeteringEnabled: false,
    bigQueryUsageEventsTableId: 'usage_events',
    ingestRatePolicyEnabled: true,
    ingestMaxSourcesPerRun: 500,
    intelBaseUrl: null,
    intelSecret: null,
    pipelineCalloutEnabled: false,
  };

  it('does not insert when metering disabled', async () => {
    insertFn.mockClear();
    await recordIngestRunCompleteMetering(base, {
      runAtIso: '2026-04-05T12:00:00.000Z',
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
        publishSkipped: 0,
        skippedRatePolicy: 0,
        maxSourcesPerRunApplied: null,
        sourcesOmittedByCap: 0,
        pipelineCalled: 0,
        pipelineCallFailed: 0,
        pipelineCallSkipped: 0,
      },
    });
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('inserts one row when metering enabled', async () => {
    insertFn.mockClear();
    await recordIngestRunCompleteMetering(
      { ...base, usageMeteringEnabled: true },
      {
        runAtIso: '2026-04-05T12:00:00.000Z',
        summary: {
          processed: 2,
          unchanged: 1,
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
          publishSkipped: 0,
          skippedRatePolicy: 0,
          maxSourcesPerRunApplied: null,
          sourcesOmittedByCap: 0,
          pipelineCalled: 0,
          pipelineCallFailed: 0,
          pipelineCallSkipped: 0,
        },
      },
    );
    expect(insertFn).toHaveBeenCalledTimes(1);
    const payload = insertFn.mock.calls[0]?.[0];
    expect(payload?.rows).toBeDefined();
    const row0 = payload?.rows[0];
    expect(row0?.event_type).toBe('ingest.run.complete');
    expect(row0?.quantity).toBe(2);
  });
});
