import { z } from 'zod';
import {
  IsoDateTimeStringSchema,
  SignalSummaryV1Schema,
  WorkspaceScopeQueryV1Schema,
} from './api-serving-shared';
import { ExtractedEventFamilyMvpSchema } from './extracted-event';

/**
 * GET `/v1/entities/:entityType/:entityId`
 */
export const EntityPathParamsV1Schema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
});

export type EntityPathParamsV1 = z.infer<typeof EntityPathParamsV1Schema>;

/**
 * Timeline / history query fields without workspace scope (WS11.1 tool exposure injects workspace server-side).
 */
export const EntityDetailTimelineQueryV1Schema = z
  .object({
    timelineLimit: z.coerce.number().int().min(1).max(32).optional(),
    /** Keyset cursor (opaque): last row anchor from previous page (`timelineNextCursor`). */
    timelineCursor: z.string().max(4096).optional(),
    timelineSignalType: ExtractedEventFamilyMvpSchema.optional(),
    timelineStatus: z.string().min(1).optional(),
    timelineMinScore: z.coerce.number().int().min(0).max(100).optional(),
    /** Rows with `detected_at` strictly before this instant (seek pagination + filter). */
    timelineDetectedBefore: IsoDateTimeStringSchema.optional(),
    /** Rows with `detected_at` strictly after this instant. */
    timelineDetectedAfter: IsoDateTimeStringSchema.optional(),
  })
  .refine(
    (q) => {
      if (q.timelineDetectedAfter && q.timelineDetectedBefore) {
        return (
          new Date(q.timelineDetectedAfter).getTime() < new Date(q.timelineDetectedBefore).getTime()
        );
      }
      return true;
    },
    { message: 'timelineDetectedAfter must be < timelineDetectedBefore when both are set' },
  );

export type EntityDetailTimelineQueryV1 = z.infer<typeof EntityDetailTimelineQueryV1Schema>;

/**
 * Timeline / history query (WS6.3). Applies to `timelinePreview` and BigQuery history when enabled.
 */
export const EntityDetailQueryV1Schema = WorkspaceScopeQueryV1Schema.merge(
  EntityDetailTimelineQueryV1Schema,
);

export type EntityDetailQueryV1 = z.infer<typeof EntityDetailQueryV1Schema>;

export const EntityDetailV1ResponseSchema = z.object({
  workspaceId: z.string().min(1),
  entity: z.object({
    entityType: z.string().min(1),
    entityId: z.string().min(1),
    displayName: z.string().optional(),
  }),
  recentSignals: z.array(SignalSummaryV1Schema).max(50),
  timelinePreview: z
    .array(
      z.object({
        occurredAt: z.string().datetime(),
        label: z.string().min(1),
        signalId: z.string().optional(),
      }),
    )
    .max(32)
    .optional(),
  /** Present when more timeline rows exist after `timelinePreview` (same filters). */
  timelineNextCursor: z.string().nullable().optional(),
});

export type EntityDetailV1Response = z.infer<typeof EntityDetailV1ResponseSchema>;
