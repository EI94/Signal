import {
  BUSINESS_ENTITY_SEEDS_COLLECTION,
  type BusinessEntitySeedDocument,
  type WatchlistDocument,
} from '@signal/contracts/firestore-operational';
import {
  SOURCE_REGISTRY_COLLECTION,
  type SourceRegistryDocument,
} from '@signal/contracts/source-registry';
import type admin from 'firebase-admin';

export type WriteOutcome = 'created' | 'updated';

function coerceFirestoreDate(value: unknown): Date | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value;
  const td = (value as { toDate?: () => Date }).toDate;
  if (typeof td === 'function') {
    return td.call(value);
  }
  return undefined;
}

/** On update, keep existing `createdAt`; on create, use `doc.createdAt`. */
async function setPreservingCreatedAt<T extends { createdAt: Date; updatedAt: Date }>(
  ref: admin.firestore.DocumentReference,
  doc: T,
): Promise<WriteOutcome> {
  const before = await ref.get();
  if (!before.exists) {
    await ref.set(doc);
    return 'created';
  }
  const prev = before.data() as Record<string, unknown> | undefined;
  const createdAt = coerceFirestoreDate(prev?.createdAt) ?? doc.createdAt;
  await ref.set({ ...doc, createdAt, updatedAt: doc.updatedAt });
  return 'updated';
}

export async function putBusinessEntitySeed(
  db: admin.firestore.Firestore,
  workspaceId: string,
  doc: BusinessEntitySeedDocument,
): Promise<WriteOutcome> {
  const ref = db
    .collection('workspaces')
    .doc(workspaceId)
    .collection(BUSINESS_ENTITY_SEEDS_COLLECTION)
    .doc(doc.entityId);
  return setPreservingCreatedAt(ref, doc);
}

export async function putRegistrySource(
  db: admin.firestore.Firestore,
  doc: SourceRegistryDocument,
): Promise<WriteOutcome> {
  const ref = db.collection(SOURCE_REGISTRY_COLLECTION).doc(doc.sourceId);
  return setPreservingCreatedAt(ref, doc);
}

export async function putWatchlist(
  db: admin.firestore.Firestore,
  workspaceId: string,
  watchlistId: string,
  doc: WatchlistDocument,
): Promise<WriteOutcome> {
  const ref = db
    .collection('workspaces')
    .doc(workspaceId)
    .collection('watchlists')
    .doc(watchlistId);
  return setPreservingCreatedAt(ref, doc);
}
