import type admin from 'firebase-admin';
import { FIRESTORE_COLLECTIONS } from './paths';

/** `workspaces/{workspaceId}/signalsLatest` */
export function workspaceSignalsLatestCollection(
  db: admin.firestore.Firestore,
  workspaceId: string,
): admin.firestore.CollectionReference {
  return db
    .collection(FIRESTORE_COLLECTIONS.workspaces)
    .doc(workspaceId)
    .collection(FIRESTORE_COLLECTIONS.signalsLatest);
}

/** `workspaces/{workspaceId}/notifications` */
export function workspaceNotificationsCollection(
  db: admin.firestore.Firestore,
  workspaceId: string,
): admin.firestore.CollectionReference {
  return db
    .collection(FIRESTORE_COLLECTIONS.workspaces)
    .doc(workspaceId)
    .collection(FIRESTORE_COLLECTIONS.notifications);
}

/** `workspaces/{workspaceId}/briefs` */
export function workspaceBriefsCollection(
  db: admin.firestore.Firestore,
  workspaceId: string,
): admin.firestore.CollectionReference {
  return db
    .collection(FIRESTORE_COLLECTIONS.workspaces)
    .doc(workspaceId)
    .collection(FIRESTORE_COLLECTIONS.briefs);
}

/** `workspaces/{workspaceId}/alertRules` */
export function workspaceAlertRulesCollection(
  db: admin.firestore.Firestore,
  workspaceId: string,
): admin.firestore.CollectionReference {
  return db
    .collection(FIRESTORE_COLLECTIONS.workspaces)
    .doc(workspaceId)
    .collection(FIRESTORE_COLLECTIONS.alertRules);
}
