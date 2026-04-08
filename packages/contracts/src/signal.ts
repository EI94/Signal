import { z } from 'zod';
import { ExtractedEventFamilyMvpSchema } from './extracted-event';
import { EntityRefSchema } from './firestore-operational';
import { OrchestrationContextV1Schema } from './orchestration-context';

/** Analytical `signals.status` (operational projection; keep small). */
export const SignalStatusSchema = z.enum(['active']);

export type SignalStatus = z.infer<typeof SignalStatusSchema>;

/** Analytical `signals.novelty` — MVP default is always `new` on deterministic promotion. */
export const SignalNoveltySchema = z.enum(['new']);

export type SignalNovelty = z.infer<typeof SignalNoveltySchema>;

export const SIGNAL_PROMOTION_SCORING_VERSION = 'deterministic_v1' as const;

/** BigQuery `signals` row shape (analytics). No raw source bodies. */
export const SignalRowSchema = z.object({
  signal_id: z.string().min(1),
  workspace_id: z.string().min(1).nullable(),
  /** MVP convention: same string as `ExtractedEvent.event_family`. */
  signal_type: ExtractedEventFamilyMvpSchema,
  entity_refs_json: z.array(EntityRefSchema).nullable(),
  title: z.string().min(1),
  short_summary: z.string().nullable(),
  status: SignalStatusSchema,
  novelty: SignalNoveltySchema.nullable(),
  occurred_at: z.coerce.date(),
  detected_at: z.coerce.date(),
  latest_composite_score: z.number().int().min(0).max(100).nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type SignalRow = z.infer<typeof SignalRowSchema>;

/**
 * POST `/internal/promote-source-content-signals`
 * Loads `extracted_events` for `sourceContentId` from BigQuery and promotes qualifying rows.
 */
export const PromoteSourceContentSignalsRequestSchema = z.object({
  sourceContentId: z.string().regex(/^[a-f0-9]{32}$/),
  /** Ingestion / observation time for this SourceContent (stable across promotion retries). */
  observedAt: z.string().datetime(),
  /**
   * Source authority dimension (0–100), e.g. from registry tier. Default applied in intel if omitted.
   */
  sourceAuthority: z.number().int().min(0).max(100).optional(),
  /** Overrides `SIGNAL_DEFAULT_WORKSPACE_ID` for Firestore + BigQuery `workspace_id`. */
  workspaceId: z.string().min(1).optional(),
  /** Original source URL for provenance (propagated from ingest). */
  sourceUrl: z.string().min(1).optional(),
  /** Human label for the source (e.g. publisher name). */
  sourceLabel: z.string().min(1).optional(),
  /** Source-reported publication time (propagated from ingest/extract). */
  publishedAt: z.string().datetime().nullable().optional(),
  orchestration: OrchestrationContextV1Schema.optional(),
});

export type PromoteSourceContentSignalsRequest = z.infer<
  typeof PromoteSourceContentSignalsRequestSchema
>;
