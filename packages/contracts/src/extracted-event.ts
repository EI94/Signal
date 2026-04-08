import { z } from 'zod';
import { EntityRefSchema } from './firestore-operational';
import { OrchestrationContextV1Schema } from './orchestration-context';
import { SourceCategorySchema } from './source-registry';

/**
 * MVP event families for deterministic extraction (WS5.1). Aligned with event-and-signal-taxonomy-v1.
 */
export const ExtractedEventFamilyMvpSchema = z.enum([
  'project_award',
  'partnership_mou',
  'earnings_reporting_update',
  'ma_divestment',
  'technology_milestone',
]);

export type ExtractedEventFamilyMvp = z.infer<typeof ExtractedEventFamilyMvpSchema>;

/** BigQuery `extracted_events` row shape for inserts (analytics). */
export const ExtractedEventRowSchema = z.object({
  extracted_event_id: z.string().min(1),
  event_family: ExtractedEventFamilyMvpSchema,
  event_time: z.date(),
  event_time_precision: z.string().nullable(),
  confidence: z.number().int().min(0).max(100).nullable(),
  ambiguity_notes: z.string().nullable(),
  evidence_source_content_ids: z.array(z.string().min(1)).min(1),
  extracted_facts_json: z.record(z.string(), z.unknown()).nullable(),
  linked_entity_refs_json: z.array(EntityRefSchema).nullable(),
  created_at: z.date(),
});

export type ExtractedEventRow = z.infer<typeof ExtractedEventRowSchema>;

/**
 * POST `/internal/extract-source-content` — caller provides pointers + registry hints; intel loads normalized text from GCS.
 */
export const ExtractSourceContentRequestSchema = z.object({
  sourceContentId: z.string().regex(/^[a-f0-9]{32}$/),
  sourceId: z.string().uuid(),
  normalizedGcsUri: z.string().min(1),
  observedAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
  sourceCategory: SourceCategorySchema.optional(),
  linkedEntityRefs: z.array(EntityRefSchema).default([]),
  orchestration: OrchestrationContextV1Schema.optional(),
});

export type ExtractSourceContentRequest = z.infer<typeof ExtractSourceContentRequestSchema>;
