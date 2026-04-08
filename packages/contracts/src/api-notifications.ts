import { z } from 'zod';
import { CursorPaginationQueryV1Schema, WorkspaceScopeQueryV1Schema } from './api-serving-shared';
import { NotificationStatusSchema } from './firestore-operational';

/**
 * GET `/v1/notifications`
 */
export const NotificationsListQueryV1Schema = CursorPaginationQueryV1Schema.merge(
  WorkspaceScopeQueryV1Schema,
).extend({
  status: NotificationStatusSchema.optional(),
});

export type NotificationsListQueryV1 = z.infer<typeof NotificationsListQueryV1Schema>;

export const NotificationItemV1Schema = z.object({
  notificationId: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1),
  message: z.string().optional(),
  status: NotificationStatusSchema,
  signalId: z.string().optional(),
  createdAt: z.string().datetime(),
  /**
   * Present when the notification targets one user; omitted for workspace-wide broadcast docs
   * (`userId` absent in Firestore). Broadcast items are list-visible but not PATCH-mutable.
   */
  userId: z.string().min(1).optional(),
});

export type NotificationItemV1 = z.infer<typeof NotificationItemV1Schema>;

/** Workspace broadcast: no per-user targeting — read/dismiss via API is not supported in v1. */
export function isBroadcastNotificationItem(item: Pick<NotificationItemV1, 'userId'>): boolean {
  return item.userId === undefined || item.userId === null || item.userId === '';
}

export const NotificationsListV1ResponseSchema = z.object({
  workspaceId: z.string().min(1),
  items: z.array(NotificationItemV1Schema).max(100),
  nextPageToken: z.string().nullable(),
});

export type NotificationsListV1Response = z.infer<typeof NotificationsListV1ResponseSchema>;

/**
 * `PATCH /v1/notifications/:notificationId`
 * Request body: target status after the operation (`read` or `dismissed`).
 */
export const NotificationPathParamsV1Schema = z.object({
  notificationId: z.string().min(1),
});

export type NotificationPathParamsV1 = z.infer<typeof NotificationPathParamsV1Schema>;

export const NotificationPatchBodyV1Schema = z.object({
  status: z.enum(['read', 'dismissed']),
});

export type NotificationPatchBodyV1 = z.infer<typeof NotificationPatchBodyV1Schema>;

export const NotificationPatchV1ResponseSchema = z.object({
  notification: NotificationItemV1Schema,
});

export type NotificationPatchV1Response = z.infer<typeof NotificationPatchV1ResponseSchema>;
