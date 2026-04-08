import { z } from 'zod';

/**
 * Analytical row shapes aligned to BigQuery `signal_*_analytics` tables (snake_case fields).
 * For future ingestion validation — not used by HTTP APIs in WS3.2.
 */

/** `signal_score_history` row (subset aligned to scoring-model v1 dimensions, 0–100 integers). */
export const SignalScoreSnapshotSchema = z.object({
  signal_id: z.string().min(1),
  scored_at: z.coerce.date(),
  relevance: z.number().int().min(0).max(100).optional(),
  impact: z.number().int().min(0).max(100).optional(),
  freshness: z.number().int().min(0).max(100).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  source_authority: z.number().int().min(0).max(100).optional(),
  composite_score: z.number().int().min(0).max(100),
  scoring_version: z.string().min(1),
  workspace_id: z.string().optional(),
});

export type SignalScoreSnapshot = z.infer<typeof SignalScoreSnapshotSchema>;

/** `entity_signal_links` analytical bridge row. */
export const EntitySignalLinkRowSchema = z.object({
  entity_type: z.string().min(1),
  entity_id: z.string().min(1),
  signal_id: z.string().min(1),
  signal_type: z.string().min(1),
  occurred_at: z.coerce.date().optional(),
  detected_at: z.coerce.date(),
  composite_score: z.number().int().min(0).max(100).optional(),
  status: z.string().min(1),
  novelty: z.string().optional(),
  workspace_id: z.string().optional(),
});

export type EntitySignalLinkRow = z.infer<typeof EntitySignalLinkRowSchema>;
