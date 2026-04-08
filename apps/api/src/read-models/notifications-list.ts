import {
  isBroadcastNotificationItem,
  type NotificationDocument,
  type NotificationsListQueryV1,
  type NotificationsListV1Response,
} from '@signal/contracts';
import { getFirestoreDb } from '../lib/firebase-admin';
import { parseNotificationDocument } from '../lib/firestore/parse-documents';
import { workspaceNotificationsCollection } from '../lib/firestore/workspace-collections';
import { decodeOffsetCursor, encodeOffsetCursor } from './offset-cursor';

const FETCH_MAX = 200;

function matchesUser(n: NotificationDocument, uid: string): boolean {
  return isBroadcastNotificationItem({ userId: n.userId }) || n.userId === uid;
}

/**
 * Operational notifications list; filters by recipient and optional status, then offset pagination.
 */
export async function buildNotificationsListReadModel(params: {
  readonly workspaceId: string;
  readonly uid: string;
  readonly query: NotificationsListQueryV1;
}): Promise<NotificationsListV1Response> {
  const { workspaceId, uid, query } = params;
  const db = getFirestoreDb();
  const col = workspaceNotificationsCollection(db, workspaceId);
  const snap = await col.orderBy('createdAt', 'desc').limit(FETCH_MAX).get();

  const collected: { n: NotificationDocument; id: string }[] = [];
  for (const doc of snap.docs) {
    const parsed = parseNotificationDocument(doc.data());
    if (!parsed.success) continue;
    collected.push({ n: parsed.data, id: doc.id });
  }
  let rows = collected.filter(({ n }) => matchesUser(n, uid));
  if (query.status !== undefined) {
    rows = rows.filter(({ n }) => n.status === query.status);
  }

  const limit = Math.min(100, Math.max(1, query.limit ?? 50));
  const offset = decodeOffsetCursor(query.cursor);
  const slice = rows.slice(offset, offset + limit);
  const hasMore = offset + limit < rows.length;

  const items = slice.map(({ n, id }) => ({
    notificationId: id,
    type: n.type,
    title: n.title,
    message: n.message,
    status: n.status,
    signalId: n.signalId,
    createdAt: n.createdAt.toISOString(),
    ...(isBroadcastNotificationItem({ userId: n.userId }) ? {} : { userId: n.userId }),
  }));

  return {
    workspaceId,
    items,
    nextPageToken: hasMore ? encodeOffsetCursor(offset + limit) : null,
  };
}
