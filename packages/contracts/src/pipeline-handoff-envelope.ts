import { z } from 'zod';
import {
  type SourceContentPersistedEvent,
  SourceContentPersistedEventSchema,
} from './source-content-persisted-event';

/**
 * Wrapped Pub/Sub payload after GCS + BigQuery succeed (ingest → intel).
 * Subscribers should dedupe using `idempotencyKey` + domain writers’ existing keys.
 */
export const PipelineHandoffEnvelopeV1Schema = z.object({
  schemaVersion: z.literal('signal.pipeline.handoff.v1'),
  idempotencyKey: z.string().min(32).max(64),
  correlationId: z.string().uuid(),
  sourceContentPersisted: SourceContentPersistedEventSchema,
});

export type PipelineHandoffEnvelopeV1 = z.infer<typeof PipelineHandoffEnvelopeV1Schema>;

export type ParsedHandoffMeta = {
  idempotencyKey: string;
  correlationId: string;
};

/**
 * Accepts either the v1 envelope (Pub/Sub) or a bare `SourceContentPersistedEvent` (manual HTTP dev).
 */
export function parseSourceContentPersistedForIntel(
  raw: unknown,
):
  | { success: true; data: SourceContentPersistedEvent; envelope: ParsedHandoffMeta | null }
  | { success: false; error: z.ZodError } {
  const wrapped = PipelineHandoffEnvelopeV1Schema.safeParse(raw);
  if (wrapped.success) {
    return {
      success: true,
      data: wrapped.data.sourceContentPersisted,
      envelope: {
        idempotencyKey: wrapped.data.idempotencyKey,
        correlationId: wrapped.data.correlationId,
      },
    };
  }
  const flat = SourceContentPersistedEventSchema.safeParse(raw);
  if (flat.success) {
    return { success: true, data: flat.data, envelope: null };
  }
  return { success: false, error: flat.error };
}
