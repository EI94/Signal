import { z } from 'zod';

/**
 * WS10.2 — compact operational health summary for the API (pipeline freshness + stale flags).
 * Not a monitoring product; values are grounded in Firestore + optional BigQuery `usage_events`.
 */
export const HealthSummaryV1Schema = z.object({
  service: z.literal('api'),
  environment: z.enum(['development', 'staging', 'production']),
  generatedAt: z.string().datetime(),
  process: z.object({
    status: z.literal('healthy'),
  }),
  readiness: z.object({
    status: z.enum(['ready', 'not_ready']),
    firestoreOk: z.boolean(),
    reason: z.string().nullable(),
  }),
  /** Thresholds (hours) applied to stale flags — explicit for operators. */
  thresholdsHours: z.object({
    signalsLatest: z.number().positive(),
    ingestRun: z.number().positive(),
    briefDocument: z.number().positive(),
  }),
  freshness: z.object({
    signalsLatestDetectedAt: z.string().datetime().nullable(),
    briefLatestUpdatedAt: z.string().datetime().nullable(),
    lastIngestRunAt: z.string().datetime().nullable(),
    lastPromoteCompleteAt: z.string().datetime().nullable(),
    lastBriefGenerateCompleteAt: z.string().datetime().nullable(),
    lastAlertsEvaluateCompleteAt: z.string().datetime().nullable(),
  }),
  stale: z.object({
    signalsLatest: z.boolean(),
    ingestRun: z.boolean(),
    briefDocument: z.boolean(),
  }),
  usageEventsQuery: z.object({
    attempted: z.boolean(),
    ok: z.boolean(),
    reason: z.string().nullable(),
  }),
  warnings: z.array(z.string()),
});

export type HealthSummaryV1 = z.infer<typeof HealthSummaryV1Schema>;
