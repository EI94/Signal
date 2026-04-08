import type admin from 'firebase-admin';
import { FIRESTORE_COLLECTIONS } from './paths';

export function sourcesCollection(db: admin.firestore.Firestore) {
  return db.collection(FIRESTORE_COLLECTIONS.sources);
}

export function sourceRef(db: admin.firestore.Firestore, sourceId: string) {
  return sourcesCollection(db).doc(sourceId);
}

export function workspaceRootRef(db: admin.firestore.Firestore, workspaceId: string) {
  return db.collection(FIRESTORE_COLLECTIONS.workspaces).doc(workspaceId);
}

export function workspaceMembersCollection(
  db: admin.firestore.Firestore,
  workspaceId: string,
): admin.firestore.CollectionReference {
  return workspaceRootRef(db, workspaceId).collection(FIRESTORE_COLLECTIONS.members);
}

export function workspaceMemberRef(
  db: admin.firestore.Firestore,
  workspaceId: string,
  uid: string,
) {
  return workspaceMembersCollection(db, workspaceId).doc(uid);
}
