import { isBroadcastNotificationItem, type NotificationItemV1 } from '@signal/contracts';
import admin from 'firebase-admin';
import { parseNotificationDocument } from '../lib/firestore/parse-documents';
import { workspaceNotificationsCollection } from '../lib/firestore/workspace-collections';
import { resolveNotificationStatusPatch } from './notification-status-patch';

export type PatchWorkspaceNotificationError =
  | { code: 'not_found' }
  | { code: 'forbidden' }
  | { code: 'invalid_transition' }
  | { code: 'broadcast_immutable' };

export type PatchWorkspaceNotificationResult =
  | { ok: true; notification: NotificationItemV1 }
  | { ok: false; error: PatchWorkspaceNotificationError };

/**
 * Updates status for a user-targeted notification. Workspace broadcast docs (no `userId`) are immutable here.
 */
export async function patchWorkspaceNotification(params: {
  readonly db: admin.firestore.Firestore;
  readonly workspaceId: string;
  readonly notificationId: string;
  readonly uid: string;
  readonly requestedStatus: 'read' | 'dismissed';
}): Promise<PatchWorkspaceNotificationResult> {
  const { db, workspaceId, notificationId, uid, requestedStatus } = params;
  const ref = workspaceNotificationsCollection(db, workspaceId).doc(notificationId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { ok: false, error: { code: 'not_found' } };
  }

  const parsed = parseNotificationDocument(snap.data());
  if (!parsed.success) {
    return { ok: false, error: { code: 'not_found' } };
  }

  const n = parsed.data;
  if (isBroadcastNotificationItem({ userId: n.userId })) {
    return { ok: false, error: { code: 'broadcast_immutable' } };
  }
  if (n.userId !== uid) {
    return { ok: false, error: { code: 'forbidden' } };
  }

  const transition = resolveNotificationStatusPatch(n.status, requestedStatus);
  if (!transition.ok) {
    return { ok: false, error: { code: 'invalid_transition' } };
  }

  if (transition.nextStatus === n.status) {
    return {
      ok: true,
      notification: {
        notificationId,
        type: n.type,
        title: n.title,
        message: n.message,
        status: n.status,
        signalId: n.signalId,
        createdAt: n.createdAt.toISOString(),
        userId: n.userId,
      },
    };
  }

  await ref.update({
    status: transition.nextStatus,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const after = await ref.get();
  const reparsed = parseNotificationDocument(after.data());
  if (!reparsed.success) {
    return { ok: false, error: { code: 'not_found' } };
  }

  const next = reparsed.data;
  return {
    ok: true,
    notification: {
      notificationId,
      type: next.type,
      title: next.title,
      message: next.message,
      status: next.status,
      signalId: next.signalId,
      createdAt: next.createdAt.toISOString(),
      userId: next.userId,
    },
  };
}
