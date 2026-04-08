import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Initialize Firebase Admin once (Application Default Credentials).
 * Local: `gcloud auth application-default login`. Cloud: runtime service account.
 */
export function initFirebaseAdmin(projectId: string): void {
  if (admin.apps.length > 0) return;
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
}

export function getFirebaseAuth(): admin.auth.Auth {
  return admin.auth();
}

function firestoreDatabaseId(): string {
  return process.env.FIRESTORE_DATABASE_ID?.trim() || 'default';
}

/** Firestore for workspace membership (same project as Auth). */
export function getFirestoreDb(): admin.firestore.Firestore {
  return getFirestore(admin.app(), firestoreDatabaseId());
}
