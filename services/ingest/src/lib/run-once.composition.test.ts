/**
 * WS10.3 — one composition path: run-once → processOneSource (changed) → archive + handoff + summary counters.
 * External I/O is mocked; asserts real `runOnceIngestCycle` wiring.
 */
import type { IngestRuntimeConfig } from '@signal/config';
import type { IngestFetchRecord, SourceRegistryDocument } from '@signal/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { archiveSourceContentAndPersistRow } from './archive-source-content';
import { processOneSource } from './process-one-source';
import { publishSourceContentPersistedHandoff } from './publish-source-content-handoff';
import { recordIngestRunCompleteMetering } from './record-usage-metering';
import { runOnceIngestCycle } from './run-once';
import { getActiveSourceById, listActiveSources } from './source-registry-query';

vi.mock('./source-registry-query', () => ({
  listActiveSources: vi.fn(),
  getActiveSourceById: vi.fn(),
}));

vi.mock('./process-one-source', () => ({
  processOneSource: vi.fn(),
}));

vi.mock('./archive-source-content', () => ({
  archiveSourceContentAndPersistRow: vi.fn(),
}));

vi.mock('./publish-source-content-handoff', () => ({
  publishSourceContentPersistedHandoff: vi.fn(),
}));

vi.mock('./record-usage-metering', () => ({
  recordIngestRunCompleteMetering: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./source-operational-patch', () => ({
  patchSourceOperationalFetchState: vi.fn().mockResolvedValue(undefined),
}));

const sourceId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function makeSource(overrideSourceId: string = sourceId): SourceRegistryDocument {
  return {
    sourceId: overrideSourceId,
    name: 'Test source',
    canonicalUrl: 'https://example.com/page',
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
  };
}

function ingestConfig(over: Partial<IngestRuntimeConfig> = {}): IngestRuntimeConfig {
  return {
    serviceName: 'ingest',
    environment: 'development',
    port: 4001,
    logLevel: 'silent',
    version: '0.0.0',
    isProduction: false,
    firebaseProjectId: 'proj',
    fetchTimeoutMs: 30_000,
    fetchMaxBodyBytes: 10_000_000,
    fetchUserAgent: 'test',
    runOnceSecret: null,
    persistenceEnabled: true,
    gcsRawBucketName: 'bucket',
    bigQueryDatasetId: 'signal_dev_analytics',
    bigQuerySourceContentsTableId: 'source_contents',
    defaultWorkspaceId: 'ws1',
    publishSourceContentEventsEnabled: false,
    pubsubTopicSourceContentPersisted: 'source.delta.detected',
    pipelineHandoffEnvelopeEnabled: false,
    usageMeteringEnabled: false,
    bigQueryUsageEventsTableId: 'usage_events',
    ingestRatePolicyEnabled: true,
    ingestMaxSourcesPerRun: 500,
    intelBaseUrl: null,
    intelSecret: null,
    pipelineCalloutEnabled: false,
    ...over,
  };
}

describe('runOnceIngestCycle composition', () => {
  const db = {} as Parameters<typeof runOnceIngestCycle>[0];

  beforeEach(() => {
    vi.mocked(listActiveSources).mockResolvedValue([makeSource()]);
    vi.mocked(getActiveSourceById).mockResolvedValue(null);
    vi.mocked(processOneSource).mockClear();
    vi.mocked(recordIngestRunCompleteMetering).mockResolvedValue(undefined);
  });

  it('increments persisted and published when archive + handoff succeed', async () => {
    const record: IngestFetchRecord = {
      sourceId,
      fetchedAt: '2026-04-05T12:00:00.000Z',
      deltaOutcome: 'changed',
      httpStatusCode: 200,
      contentType: 'text/html',
      etag: null,
      lastModified: null,
      contentHash: 'c'.repeat(64),
      byteLength: 10,
    };
    vi.mocked(processOneSource).mockResolvedValue({
      record,
      persistRequest: {
        source: makeSource(),
        rawBody: new ArrayBuffer(4),
        contentFingerprintHex: 'd'.repeat(64),
        observedAt: new Date('2026-04-05T12:00:00.000Z'),
        contentType: 'text/html',
        lastModified: null,
      },
    });
    vi.mocked(archiveSourceContentAndPersistRow).mockResolvedValue({
      sourceContentId: 'ab'.repeat(16),
      rawObjectKey: 'raw/k',
      manifestObjectKey: 'manifest/k',
      archivedGcsUri: 'gs://bucket/raw/x',
      manifestGcsUri: 'gs://bucket/man/x',
    });
    vi.mocked(publishSourceContentPersistedHandoff).mockResolvedValue('published');

    const cfg = ingestConfig();
    const out = await runOnceIngestCycle(db, cfg, {});

    expect(out.ok).toBe(true);
    expect(out.summary.processed).toBe(1);
    expect(out.summary.changed).toBe(1);
    expect(out.summary.archived).toBe(1);
    expect(out.summary.persisted).toBe(1);
    expect(out.summary.published).toBe(1);
    expect(vi.mocked(archiveSourceContentAndPersistRow)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(publishSourceContentPersistedHandoff)).toHaveBeenCalledTimes(1);
  });

  it('truncates full run to ingestMaxSourcesPerRun', async () => {
    const id2 = '4fa85f64-5717-4562-b3fc-2c963f66afa7';
    const id3 = '5fa85f64-5717-4562-b3fc-2c963f66afa8';
    vi.mocked(listActiveSources).mockResolvedValue([
      makeSource(),
      makeSource(id2),
      makeSource(id3),
    ]);
    vi.mocked(processOneSource).mockResolvedValue({
      record: {
        sourceId,
        fetchedAt: '2026-04-05T12:00:00.000Z',
        deltaOutcome: 'unchanged',
        httpStatusCode: 200,
        contentType: 'text/html',
        etag: null,
        lastModified: null,
        contentHash: 'a'.repeat(64),
        byteLength: 1,
      },
    });
    const out = await runOnceIngestCycle(db, ingestConfig({ ingestMaxSourcesPerRun: 2 }), {});
    expect(out.summary.sourcesOmittedByCap).toBe(1);
    expect(out.summary.maxSourcesPerRunApplied).toBe(2);
    expect(out.summary.processed).toBe(2);
    expect(vi.mocked(processOneSource)).toHaveBeenCalledTimes(2);
  });

  it('does not apply per-run cap to single-source fetch', async () => {
    vi.mocked(getActiveSourceById).mockResolvedValue(makeSource());
    vi.mocked(processOneSource).mockResolvedValue({
      record: {
        sourceId,
        fetchedAt: '2026-04-05T12:00:00.000Z',
        deltaOutcome: 'unchanged',
        httpStatusCode: 200,
        contentType: 'text/html',
        etag: null,
        lastModified: null,
        contentHash: 'a'.repeat(64),
        byteLength: 1,
      },
    });
    const out = await runOnceIngestCycle(db, ingestConfig({ ingestMaxSourcesPerRun: 1 }), {
      sourceId,
    });
    expect(out.summary.sourcesOmittedByCap).toBe(0);
    expect(out.summary.maxSourcesPerRunApplied).toBeNull();
    expect(out.summary.processed).toBe(1);
  });

  it('increments skippedRatePolicy for rate_policy_deferred', async () => {
    vi.mocked(processOneSource).mockResolvedValue({
      record: {
        sourceId,
        fetchedAt: '2026-04-05T12:00:00.000Z',
        deltaOutcome: 'unsupported_or_skipped',
        httpStatusCode: null,
        contentType: null,
        etag: null,
        lastModified: null,
        contentHash: null,
        byteLength: null,
        reasonCode: 'rate_policy_deferred',
      },
    });
    const out = await runOnceIngestCycle(db, ingestConfig(), {});
    expect(out.summary.skipped).toBe(1);
    expect(out.summary.skippedRatePolicy).toBe(1);
  });
});
