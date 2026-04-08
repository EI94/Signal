import { randomUUID } from 'node:crypto';
import type { IngestRuntimeConfig } from '@signal/config';
import {
  buildSourceContentHandoffIdempotencyKey,
  buildSourceContentPersistedEventV1,
  PipelineHandoffEnvelopeV1Schema,
  type SourceContentPersistedEvent,
} from '@signal/contracts';
import type { ArchivePersistenceResult } from './archive-source-content';
import { registrySourceTypeToContentRecordType } from './map-content-record-type';
import type { PersistRequestPayload } from './process-one-source';
import { publishJsonToTopic } from './pubsub-publish-json';

export type PublishHandoffResult = 'published' | 'publish_failed' | 'publish_skipped';

/**
 * After GCS + BigQuery persistence: optional Pub/Sub handoff for downstream extraction.
 * Persistence semantics are unchanged if publish fails or is disabled.
 */
export async function publishSourceContentPersistedHandoff(
  config: IngestRuntimeConfig,
  archived: ArchivePersistenceResult,
  persist: PersistRequestPayload,
): Promise<PublishHandoffResult> {
  if (!config.publishSourceContentEventsEnabled) {
    return 'publish_skipped';
  }

  const event: SourceContentPersistedEvent = buildSourceContentPersistedEventV1({
    sourceContentId: archived.sourceContentId,
    sourceId: persist.source.sourceId,
    registrySourceType: persist.source.sourceType,
    contentRecordType: registrySourceTypeToContentRecordType(persist.source.sourceType),
    sourceUrl: persist.source.canonicalUrl,
    observedAt: persist.observedAt,
    archivedGcsUri: archived.archivedGcsUri,
    manifestGcsUri: archived.manifestGcsUri,
    contentHash: persist.contentFingerprintHex,
    mimeType: persist.contentType?.trim() ? persist.contentType.trim() : null,
    language: persist.source.parserStrategy.contentLanguageHint ?? null,
    workspaceId: config.defaultWorkspaceId,
    publishedAt: persist.lastModified,
  });

  try {
    const payload = config.pipelineHandoffEnvelopeEnabled
      ? PipelineHandoffEnvelopeV1Schema.parse({
          schemaVersion: 'signal.pipeline.handoff.v1',
          idempotencyKey: buildSourceContentHandoffIdempotencyKey(archived.sourceContentId),
          correlationId: randomUUID(),
          sourceContentPersisted: event,
        })
      : event;

    await publishJsonToTopic({
      projectId: config.firebaseProjectId,
      topicName: config.pubsubTopicSourceContentPersisted,
      json: payload,
    });
    return 'published';
  } catch {
    return 'publish_failed';
  }
}
