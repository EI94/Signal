import { z } from 'zod';

/**
 * Optional cross-step tracing for internal HTTP and future queue deliveries.
 * Does not change pipeline semantics; processors may log or forward as needed.
 */
export const OrchestrationContextV1Schema = z.object({
  correlationId: z.string().uuid().optional(),
  /** Stable key for dedupe observability; must not replace domain idempotency in storage writers. */
  idempotencyKey: z.string().min(8).max(256).optional(),
  /** Pub/Sub push / Cloud Tasks attempt number when applicable. */
  deliveryAttempt: z.number().int().min(1).max(500).optional(),
});

export type OrchestrationContextV1 = z.infer<typeof OrchestrationContextV1Schema>;

/** Explicit step names for logs and future metrics (no runtime registry). */
export const ORCHESTRATION_STEP = {
  INGEST_SCHEDULED_RUN: 'ingest.scheduled_run',
  INGEST_SOURCE_CONTENT_PERSISTED_HANDOFF: 'ingest.source_content_persisted_handoff',
  INTEL_SOURCE_CONTENT_INTAKE: 'intel.source_content_intake',
  INTEL_EXTRACT_SOURCE_CONTENT: 'intel.extract_source_content',
  INTEL_PROMOTE_SOURCE_CONTENT_SIGNALS: 'intel.promote_source_content_signals',
} as const;

export type OrchestrationStepId = (typeof ORCHESTRATION_STEP)[keyof typeof ORCHESTRATION_STEP];
