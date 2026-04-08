import { z } from 'zod';

/** Supported morning brief variants (WS9.2). */
export const MorningBriefTypeSchema = z.enum(['daily_workspace', 'board_digest']);

export type MorningBriefType = z.infer<typeof MorningBriefTypeSchema>;

/**
 * POST `/internal/generate-brief` and `generate_brief` internal tool input.
 */
export const GenerateMorningBriefRequestSchema = z.object({
  workspaceId: z.string().min(1).optional(),
  briefType: MorningBriefTypeSchema,
  /** UTC calendar day for `periodStart`/`periodEnd` (inclusive day window). Default: today UTC. */
  periodDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type GenerateMorningBriefRequest = z.infer<typeof GenerateMorningBriefRequestSchema>;

/**
 * Successful generation result (metadata + pointers; not full markdown on the wire for large bodies).
 */
export const MorningBriefGenerationResultSchema = z.object({
  briefId: z.string().min(1),
  briefType: MorningBriefTypeSchema,
  workspaceId: z.string().min(1),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  /** `gs://` URI when body was uploaded to GCS. */
  summaryRef: z.string().min(1).optional(),
  markdownChars: z.number().int().nonnegative(),
  sourceSignalIds: z.array(z.string()).max(500),
  /** True if optional Perplexity enrichment produced the executive summary block. */
  modelAssisted: z.boolean(),
});

export type MorningBriefGenerationResult = z.infer<typeof MorningBriefGenerationResultSchema>;

/** BigQuery `brief_runs` row (snake_case, aligned with DDL). */
export const BriefRunRowSchema = z.object({
  brief_run_id: z.string().min(1),
  workspace_id: z.string().min(1),
  brief_type: z.string().min(1),
  period_start: z.coerce.date(),
  period_end: z.coerce.date(),
  status: z.string().min(1),
  source_signal_ids: z.array(z.string()),
  generated_at: z.coerce.date(),
  model_assisted: z.boolean(),
  created_at: z.coerce.date(),
});

export type BriefRunRow = z.infer<typeof BriefRunRowSchema>;
