import { z } from 'zod';
import { EntityRefSchema } from './firestore-operational';

export const WatchlistSummaryV1Schema = z.object({
  watchlistId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  entityCount: z.number().int().nonnegative(),
  isDefault: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type WatchlistSummaryV1 = z.infer<typeof WatchlistSummaryV1Schema>;

export const WatchlistDetailV1Schema = z.object({
  watchlistId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  entityRefs: z.array(EntityRefSchema),
  isDefault: z.boolean().optional(),
  createdBy: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type WatchlistDetailV1 = z.infer<typeof WatchlistDetailV1Schema>;

export const WatchlistsListV1ResponseSchema = z.object({
  watchlists: z.array(WatchlistSummaryV1Schema),
});

export type WatchlistsListV1Response = z.infer<typeof WatchlistsListV1ResponseSchema>;

export const WatchlistDetailV1ResponseSchema = z.object({
  watchlist: WatchlistDetailV1Schema,
});

export type WatchlistDetailV1Response = z.infer<typeof WatchlistDetailV1ResponseSchema>;

export const CreateWatchlistRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  entityRefs: z.array(EntityRefSchema).max(500),
});

export type CreateWatchlistRequest = z.infer<typeof CreateWatchlistRequestSchema>;

export const UpdateWatchlistRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  entityRefs: z.array(EntityRefSchema).max(500).optional(),
});

export type UpdateWatchlistRequest = z.infer<typeof UpdateWatchlistRequestSchema>;

export const WatchlistPathParamsSchema = z.object({
  watchlistId: z.string().min(1),
});

export type WatchlistPathParams = z.infer<typeof WatchlistPathParamsSchema>;

export const DeleteWatchlistResponseSchema = z.object({
  deleted: z.literal(true),
});

export type DeleteWatchlistResponse = z.infer<typeof DeleteWatchlistResponseSchema>;
