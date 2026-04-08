import { z } from 'zod';
import {
  CursorPaginationQueryV1Schema,
  SignalSummaryV1Schema,
  WorkspaceScopeQueryV1Schema,
} from './api-serving-shared';
import { ExtractedEventFamilyMvpSchema } from './extracted-event';

/**
 * GET `/v1/map/signals` — map-ready points (coordinates optional until geo read model exists).
 */
export const MapSignalsQueryV1Schema = CursorPaginationQueryV1Schema.merge(
  WorkspaceScopeQueryV1Schema,
).extend({
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  signalType: ExtractedEventFamilyMvpSchema.optional(),
});

export type MapSignalsQueryV1 = z.infer<typeof MapSignalsQueryV1Schema>;

export const MapSignalPointV1Schema = SignalSummaryV1Schema.extend({
  /** WGS84 when the read model resolves geography. */
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  /** Fallback clustering key when lat/lng are not yet available. */
  regionKey: z.string().max(200).optional(),
});

export type MapSignalPointV1 = z.infer<typeof MapSignalPointV1Schema>;

export const MapSignalsV1ResponseSchema = z.object({
  workspaceId: z.string().min(1),
  points: z.array(MapSignalPointV1Schema).max(500),
  nextPageToken: z.string().nullable(),
});

export type MapSignalsV1Response = z.infer<typeof MapSignalsV1ResponseSchema>;
