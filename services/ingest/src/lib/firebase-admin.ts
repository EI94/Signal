import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

export function initFirebaseAdmin(projectId: string): void {
  if (admin.apps.length > 0) return;
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
}

function firestoreDatabaseId(): string {
  return process.env.FIRESTORE_DATABASE_ID?.trim() || 'default';
}

export function getFirestoreDb(): admin.firestore.Firestore {
  return getFirestore(admin.app(), firestoreDatabaseId());
}
