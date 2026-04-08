import type { IngestRuntimeConfig } from '@signal/config';
import type { SourceRegistryDocument } from '@signal/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { ArchivePersistenceResult } from './archive-source-content';
import type { PersistRequestPayload } from './process-one-source';
import { publishSourceContentPersistedHandoff } from './publish-source-content-handoff';

const { publishJsonToTopic } = vi.hoisted(() => ({
  publishJsonToTopic: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./pubsub-publish-json', () => ({
  publishJsonToTopic,
}));

function baseSource(): SourceRegistryDocument {
  return {
    sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    name: 'S',
    canonicalUrl: 'https://example.com',
    sourceType: 'rss_feed',
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
  };
}

function baseConfig(overrides: Partial<IngestRuntimeConfig> = {}): IngestRuntimeConfig {
  return {
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
    gcsRawBucketName: 'proj-signal-dev-raw',
    bigQueryDatasetId: 'signal_dev_analytics',
    bigQuerySourceContentsTableId: 'source_contents',
    defaultWorkspaceId: null,
    publishSourceContentEventsEnabled: false,
    pubsubTopicSourceContentPersisted: 'source.delta.detected',
    pipelineHandoffEnvelopeEnabled: true,
    usageMeteringEnabled: false,
    bigQueryUsageEventsTableId: 'usage_events',
    ingestRatePolicyEnabled: true,
    ingestMaxSourcesPerRun: 500,
    ...overrides,
  } as IngestRuntimeConfig;
}

function basePersist(source: SourceRegistryDocument): PersistRequestPayload {
  return {
    source,
    rawBody: new ArrayBuffer(0),
    contentFingerprintHex: 'ab'.repeat(32),
    observedAt: new Date('2026-04-04T12:00:00.000Z'),
    contentType: 'application/rss+xml',
    lastModified: null,
  };
}

function baseArchived(): ArchivePersistenceResult {
  return {
    sourceContentId: 'cd'.repeat(16),
    rawObjectKey: 'raw/k',
    manifestObjectKey: 'manifest/k',
    archivedGcsUri: 'gs://proj-signal-dev-raw/raw/k',
    manifestGcsUri: 'gs://proj-signal-dev-raw/manifest/k',
  };
}

describe('publishSourceContentPersistedHandoff', () => {
  it('returns publish_skipped and does not call Pub/Sub when disabled', async () => {
    publishJsonToTopic.mockClear();
    const source = baseSource();
    const r = await publishSourceContentPersistedHandoff(
      baseConfig({ publishSourceContentEventsEnabled: false }),
      baseArchived(),
      basePersist(source),
    );
    expect(r).toBe('publish_skipped');
    expect(publishJsonToTopic).not.toHaveBeenCalled();
  });

  it('publishes JSON to the configured topic when enabled', async () => {
    publishJsonToTopic.mockClear();
    const source = baseSource();
    const r = await publishSourceContentPersistedHandoff(
      baseConfig({
        publishSourceContentEventsEnabled: true,
        pubsubTopicSourceContentPersisted: 'source.delta.detected',
      }),
      baseArchived(),
      basePersist(source),
    );
    expect(r).toBe('published');
    expect(publishJsonToTopic).toHaveBeenCalledTimes(1);
    const call = publishJsonToTopic.mock.calls[0]?.[0];
    expect(call?.projectId).toBe('proj');
    expect(call?.topicName).toBe('source.delta.detected');
    const payload = call?.json as {
      schemaVersion?: string;
      sourceContentPersisted?: { eventType?: string; sourceType?: string };
    };
    expect(payload?.schemaVersion).toBe('signal.pipeline.handoff.v1');
    expect(payload?.sourceContentPersisted?.eventType).toBe('source_content.persisted');
    expect(payload?.sourceContentPersisted?.sourceType).toBe('rss_entry');
  });

  it('publishes bare persisted event when envelope is disabled', async () => {
    publishJsonToTopic.mockClear();
    const source = baseSource();
    const r = await publishSourceContentPersistedHandoff(
      baseConfig({
        publishSourceContentEventsEnabled: true,
        pipelineHandoffEnvelopeEnabled: false,
      }),
      baseArchived(),
      basePersist(source),
    );
    expect(r).toBe('published');
    const call = publishJsonToTopic.mock.calls[0]?.[0];
    const payload = call?.json as { eventType?: string; sourceType?: string };
    expect(payload?.eventType).toBe('source_content.persisted');
    expect(payload?.sourceType).toBe('rss_entry');
  });

  it('returns publish_failed when Pub/Sub throws without rethrowing', async () => {
    publishJsonToTopic.mockRejectedValueOnce(new Error('pubsub down'));
    const source = baseSource();
    const r = await publishSourceContentPersistedHandoff(
      baseConfig({ publishSourceContentEventsEnabled: true }),
      baseArchived(),
      basePersist(source),
    );
    expect(r).toBe('publish_failed');
  });
});
