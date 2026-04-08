import { z } from 'zod';
import { ExtractedEventFamilyMvpSchema } from './extracted-event';
import { EntityRefSchema } from './firestore-operational';

/**
 * WS6.1 — shared pieces for public serving API contracts (v1).
 * Summary shapes are intentionally smaller than analytical rows or Firestore docs.
 */

export const IsoDateTimeStringSchema = z.string().datetime();

/** Compact signal row for feeds, board, map — aligned with `LatestSignalDocument` / promotion output, not BQ dumps. */
export const SignalSummaryV1Schema = z.object({
  signalId: z.string().min(1),
  signalType: ExtractedEventFamilyMvpSchema,
  title: z.string().min(1),
  shortSummary: z.string().nullable().optional(),
  status: z.string().min(1),
  novelty: z.string().nullable().optional(),
  compositeScore: z.number().int().min(0).max(100).nullable().optional(),
  occurredAt: IsoDateTimeStringSchema,
  detectedAt: IsoDateTimeStringSchema,
  primaryEntityRefs: z.array(EntityRefSchema).max(16).optional(),
  sourceLabel: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  sourcePublishedAt: z.string().nullable().optional(),
  sourceTimeSemantic: z.enum(['published', 'observed']).nullable().optional(),
  countryCodes: z.array(z.string()).optional(),
  primaryCountryCode: z.string().nullable().optional(),
  countryAttributionMode: z
    .enum([
      'explicit_geography',
      'source_linked_geography',
      'text_inferred_geography',
      'hq_fallback',
    ])
    .nullable()
    .optional(),
});

export type SignalSummaryV1 = z.infer<typeof SignalSummaryV1Schema>;

/** Cursor pagination for GET querystrings (coerced). */
export const CursorPaginationQueryV1Schema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(2048).optional(),
});

export type CursorPaginationQueryV1 = z.infer<typeof CursorPaginationQueryV1Schema>;

/** When not implied by auth default workspace header. */
export const WorkspaceScopeQueryV1Schema = z.object({
  workspaceId: z.string().min(1).optional(),
});

export type WorkspaceScopeQueryV1 = z.infer<typeof WorkspaceScopeQueryV1Schema>;
