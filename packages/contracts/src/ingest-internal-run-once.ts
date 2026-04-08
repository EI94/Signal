import { z } from 'zod';

/**
 * POST `/internal/run-once` — scheduler or operator; all fields optional beyond existing behavior.
 */
export const IngestInternalRunOnceBodyV1Schema = z.object({
  sourceId: z.string().uuid().optional(),
  correlationId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(8).max(256).optional(),
  /** When Cloud Scheduler triggers; echo in response for traceability. */
  scheduledAt: z.string().datetime().optional(),
});

export type IngestInternalRunOnceBodyV1 = z.infer<typeof IngestInternalRunOnceBodyV1Schema>;
