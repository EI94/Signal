import { z } from 'zod';
import { SourceTypeSchema } from './source-registry';

/**
 * Handoff message after GCS archive + BigQuery `source_contents` insert succeed (WS4.4).
 * Published to Pub/Sub (default topic `source.delta.detected`); may be wrapped in `PipelineHandoffEnvelopeV1` when configured.
 * No raw bodies; downstream intel may fetch bytes from `archivedGcsUri`.
 */

export const SourceContentPersistedEventSchema = z.object({
  eventType: z.literal('source_content.persisted'),
  eventVersion: z.literal('v1'),
  sourceContentId: z.string().min(1),
  sourceId: z.string().uuid(),
  /** Firestore `Source.sourceType` (registry). */
  registrySourceType: SourceTypeSchema,
  /**
   * Content record / ontology kind (e.g. `rss_entry`), same meaning as BigQuery `source_contents.source_type`.
   * Named `sourceType` in the payload for historical alignment with architecture docs; not the registry field.
   */
  sourceType: z.string().min(1),
  sourceUrl: z.string().min(1),
  observedAt: z.string().datetime(),
  archivedGcsUri: z.string().min(1),
  manifestGcsUri: z.string().min(1),
  contentHash: z.string().min(1),
  mimeType: z.string().nullable(),
  language: z.string().nullable(),
  /** Present when configured for BigQuery inserts (single-tenant routing hint). */
  workspaceId: z.string().nullable(),
  /** HTTP `Last-Modified` when available (publication time of source material, if reported). */
  publishedAt: z.string().datetime().nullable(),
  emittedAt: z.string().datetime(),
});

export type SourceContentPersistedEvent = z.infer<typeof SourceContentPersistedEventSchema>;

export type BuildSourceContentPersistedEventV1Params = {
  sourceContentId: string;
  sourceId: string;
  registrySourceType: z.infer<typeof SourceTypeSchema>;
  /** Ontology / content record type (maps to payload `sourceType`). */
  contentRecordType: string;
  sourceUrl: string;
  observedAt: Date;
  archivedGcsUri: string;
  manifestGcsUri: string;
  contentHash: string;
  mimeType: string | null;
  language: string | null;
  workspaceId: string | null;
  publishedAt: Date | null;
  /** Wall clock when the message is constructed (defaults to `new Date()`). */
  emittedAt?: Date;
};

export function buildSourceContentPersistedEventV1(
  params: BuildSourceContentPersistedEventV1Params,
): SourceContentPersistedEvent {
  const emittedAt = params.emittedAt ?? new Date();
  return SourceContentPersistedEventSchema.parse({
    eventType: 'source_content.persisted',
    eventVersion: 'v1',
    sourceContentId: params.sourceContentId,
    sourceId: params.sourceId,
    registrySourceType: params.registrySourceType,
    sourceType: params.contentRecordType,
    sourceUrl: params.sourceUrl,
    observedAt: params.observedAt.toISOString(),
    archivedGcsUri: params.archivedGcsUri,
    manifestGcsUri: params.manifestGcsUri,
    contentHash: params.contentHash,
    mimeType: params.mimeType,
    language: params.language,
    workspaceId: params.workspaceId,
    publishedAt: params.publishedAt ? params.publishedAt.toISOString() : null,
    emittedAt: emittedAt.toISOString(),
  });
}
