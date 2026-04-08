import { z } from 'zod';

/**
 * WS10.1 — append-only usage metering rows (BigQuery `usage_events`).
 * Low-cardinality `event_type`; details live in `metadata_json` when needed.
 */
export const UsageMeteringServiceNameSchema = z.enum(['ingest', 'intel']);

export type UsageMeteringServiceName = z.infer<typeof UsageMeteringServiceNameSchema>;

export const UsageMeteringEventTypeSchema = z.enum([
  'ingest.run.complete',
  'intel.normalization.complete',
  'intel.extract.complete',
  'intel.promote.complete',
  'intel.alerts.evaluate.complete',
  'intel.brief.generate.complete',
  'intel.provider.perplexity',
  'intel.email.send',
  'intel.tool.execute',
]);

export type UsageMeteringEventType = z.infer<typeof UsageMeteringEventTypeSchema>;

export const UsageMeteringOutcomeSchema = z.enum(['ok', 'failed', 'skipped']);

export type UsageMeteringOutcome = z.infer<typeof UsageMeteringOutcomeSchema>;

export const UsageMeteringUnitSchema = z.enum(['count', 'ms']);

export type UsageMeteringUnit = z.infer<typeof UsageMeteringUnitSchema>;

/**
 * Wire shape for one BigQuery row (streaming insert). Dates are native `Date` at the boundary.
 */
export const UsageMeteringRowSchema = z.object({
  usage_event_id: z.string().min(8).max(128),
  event_type: UsageMeteringEventTypeSchema,
  workspace_id: z.string().min(1).nullable(),
  service_name: UsageMeteringServiceNameSchema,
  /** e.g. perplexity, resend — null when not provider-scoped. */
  provider: z.string().min(1).nullable(),
  outcome: UsageMeteringOutcomeSchema,
  quantity: z.number().int().min(0),
  unit: UsageMeteringUnitSchema,
  related_object_id: z.string().min(1).nullable(),
  metadata_json: z.record(z.string(), z.unknown()).nullable(),
  occurred_at: z.date(),
  created_at: z.date(),
});

export type UsageMeteringRow = z.infer<typeof UsageMeteringRowSchema>;
