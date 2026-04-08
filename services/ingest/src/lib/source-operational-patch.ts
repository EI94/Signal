import { SOURCE_REGISTRY_COLLECTION } from '@signal/contracts';
import type admin from 'firebase-admin';

export type OperationalFetchPatch = {
  lastFetchedAt: Date;
  updatedAt: Date;
  fetchStatus: 'healthy' | 'degraded' | 'failing';
  consecutiveFailures: number;
  /** Omit to leave `lastContentHash` unchanged (e.g. on fetch failure). */
  lastContentHash?: string;
  /** Primary raw object URI after successful GCS upload (WS4.3+). */
  lastArchivedGcsUri?: string;
};

/**
 * Updates only ingest-operational fields; does not replace the registry document.
 */
export async function patchSourceOperationalFetchState(
  db: admin.firestore.Firestore,
  sourceId: string,
  patch: OperationalFetchPatch,
): Promise<void> {
  const ref = db.collection(SOURCE_REGISTRY_COLLECTION).doc(sourceId);
  const data: Record<string, unknown> = {
    lastFetchedAt: patch.lastFetchedAt,
    updatedAt: patch.updatedAt,
    fetchStatus: patch.fetchStatus,
    consecutiveFailures: patch.consecutiveFailures,
  };
  if (patch.lastContentHash !== undefined) {
    data.lastContentHash = patch.lastContentHash;
  }
  if (patch.lastArchivedGcsUri !== undefined) {
    data.lastArchivedGcsUri = patch.lastArchivedGcsUri;
  }
  await ref.update(data as admin.firestore.UpdateData<Record<string, unknown>>);
}
