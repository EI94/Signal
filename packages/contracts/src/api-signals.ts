import { z } from 'zod';
import {
  CursorPaginationQueryV1Schema,
  IsoDateTimeStringSchema,
  SignalSummaryV1Schema,
  WorkspaceScopeQueryV1Schema,
} from './api-serving-shared';
import { ExtractedEventFamilyMvpSchema } from './extracted-event';

/**
 * Feed filters + pagination without workspace scope (WS11.1 tool exposure injects workspace server-side).
 * Same refinements as full GET `/v1/signals` query minus `workspaceId`.
 */
export const SignalsFeedFiltersV1Schema = CursorPaginationQueryV1Schema.extend({
  signalType: ExtractedEventFamilyMvpSchema.optional(),
  status: z.string().min(1).optional(),
  novelty: z.string().min(1).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  /** Both required when filtering by entity linkage. */
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  /** Inclusive lower bound on `detectedAt` (operational snapshot). */
  detectedAfter: IsoDateTimeStringSchema.optional(),
  /** Inclusive upper bound on `detectedAt`. */
  detectedBefore: IsoDateTimeStringSchema.optional(),
  /** Inclusive lower bound on `occurredAt`. */
  occurredAfter: IsoDateTimeStringSchema.optional(),
  /** Inclusive upper bound on `occurredAt`. */
  occurredBefore: IsoDateTimeStringSchema.optional(),
  sort: z.enum(['detected_at_desc', 'occurred_at_desc', 'score_desc']).optional(),
  /** When `false`, omit `facets` in the response. Querystring-safe (avoids `z.coerce.boolean()` on `"false"`). */
  includeFacets: z.preprocess((val) => {
    if (val === undefined || val === '') return undefined;
    if (val === 'false' || val === false) return false;
    if (val === 'true' || val === true) return true;
    return undefined;
  }, z.boolean().optional()),
})
  .refine(
    (q) =>
      (q.entityType === undefined && q.entityId === undefined) ||
      (q.entityType !== undefined && q.entityId !== undefined),
    { message: 'entityType and entityId must be set together' },
  )
  .refine(
    (q) => {
      if (q.detectedAfter && q.detectedBefore) {
        return new Date(q.detectedAfter).getTime() <= new Date(q.detectedBefore).getTime();
      }
      return true;
    },
    { message: 'detectedAfter must be <= detectedBefore' },
  )
  .refine(
    (q) => {
      if (q.occurredAfter && q.occurredBefore) {
        return new Date(q.occurredAfter).getTime() <= new Date(q.occurredBefore).getTime();
      }
      return true;
    },
    { message: 'occurredAfter must be <= occurredBefore' },
  );

export type SignalsFeedFiltersV1 = z.infer<typeof SignalsFeedFiltersV1Schema>;

/**
 * GET `/v1/signals` — paginated feed.
 * WS6.3: filters and sorts are grounded in `LatestSignalDocument` / bounded window only.
 * Refines are re-applied after `merge` — Zod 4 does not carry refinements across `.merge()`.
 */
export const SignalsFeedQueryV1Schema = SignalsFeedFiltersV1Schema.merge(
  WorkspaceScopeQueryV1Schema,
)
  .refine(
    (q) =>
      (q.entityType === undefined && q.entityId === undefined) ||
      (q.entityType !== undefined && q.entityId !== undefined),
    { message: 'entityType and entityId must be set together' },
  )
  .refine(
    (q) => {
      if (q.detectedAfter && q.detectedBefore) {
        return new Date(q.detectedAfter).getTime() <= new Date(q.detectedBefore).getTime();
      }
      return true;
    },
    { message: 'detectedAfter must be <= detectedBefore' },
  )
  .refine(
    (q) => {
      if (q.occurredAfter && q.occurredBefore) {
        return new Date(q.occurredAfter).getTime() <= new Date(q.occurredBefore).getTime();
      }
      return true;
    },
    { message: 'occurredAfter must be <= occurredBefore' },
  );

export type SignalsFeedQueryV1 = z.infer<typeof SignalsFeedQueryV1Schema>;

/** Alias for tool exposure (WS11.1); same shape as feed query without `workspaceId`. */
export const SignalsFeedGetInputSchema = SignalsFeedFiltersV1Schema;

export type SignalsFeedGetInput = z.infer<typeof SignalsFeedGetInputSchema>;

/** Minimal facet buckets from the filtered window (WS6.3). */
export const FacetBucketV1Schema = z.object({
  value: z.string().max(256),
  count: z.number().int().min(0),
});

export const SignalsFeedFacetsV1Schema = z.object({
  signalTypes: z.array(FacetBucketV1Schema).max(32),
  statuses: z.array(FacetBucketV1Schema).max(64),
  novelties: z.array(FacetBucketV1Schema).max(32),
});

export type SignalsFeedFacetsV1 = z.infer<typeof SignalsFeedFacetsV1Schema>;
export type FacetBucketV1 = z.infer<typeof FacetBucketV1Schema>;

export const SignalsFeedV1ResponseSchema = z.object({
  workspaceId: z.string().min(1),
  items: z.array(SignalSummaryV1Schema).max(100),
  nextPageToken: z.string().nullable(),
  facets: SignalsFeedFacetsV1Schema.optional(),
});

export type SignalsFeedV1Response = z.infer<typeof SignalsFeedV1ResponseSchema>;
