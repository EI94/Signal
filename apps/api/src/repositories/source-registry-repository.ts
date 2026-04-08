import type { SourceCategory, SourceRegistryDocument } from '@signal/contracts';
import type admin from 'firebase-admin';
import { parseSourceRegistryDocument } from '../lib/firestore/parse-documents';
import { sourceRef, sourcesCollection } from '../lib/firestore/refs';
import { normalizeFirestoreTimestamps } from '../lib/firestore/timestamps';

/**
 * Global source registry reads/writes (`sources/{sourceId}`).
 * No fetch, no GCS, no BigQuery — configuration only until WS4.2.
 */

export async function getSourceById(
  db: admin.firestore.Firestore,
  sourceId: string,
): Promise<SourceRegistryDocument | null> {
  const snap = await sourceRef(db, sourceId).get();
  if (!snap.exists) {
    return null;
  }
  const raw = normalizeFirestoreTimestamps((snap.data() ?? {}) as Record<string, unknown>);
  const parsed = parseSourceRegistryDocument(raw);
  if (!parsed.success) {
    return null;
  }
  const doc = parsed.data;
  if (doc.sourceId !== sourceId) {
    return null;
  }
  return doc;
}

export async function listActiveSources(
  db: admin.firestore.Firestore,
): Promise<SourceRegistryDocument[]> {
  const snap = await sourcesCollection(db).where('isActive', '==', true).get();
  const out: SourceRegistryDocument[] = [];
  for (const doc of snap.docs) {
    const raw = normalizeFirestoreTimestamps(doc.data() as Record<string, unknown>);
    const parsed = parseSourceRegistryDocument(raw);
    if (parsed.success) {
      out.push(parsed.data);
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/**
 * Filters {@link listActiveSources} by category (avoids composite indexes at MVP scale).
 */
export async function listActiveSourcesByCategory(
  db: admin.firestore.Firestore,
  category: SourceCategory,
): Promise<SourceRegistryDocument[]> {
  const active = await listActiveSources(db);
  return active.filter((s) => s.category === category);
}

/** Validates and writes the full document; caller must set `updatedAt` (and `createdAt` on create). */
export async function putSource(
  db: admin.firestore.Firestore,
  document: SourceRegistryDocument,
): Promise<void> {
  const parsed = parseSourceRegistryDocument(document);
  if (!parsed.success) {
    throw parsed.error;
  }
  const data = parsed.data;
  await sourceRef(db, data.sourceId).set(data);
}

/** Partial update for ingest-maintained fields only (no raw content). */
export async function patchSourceOperationalFetchState(
  db: admin.firestore.Firestore,
  sourceId: string,
  patch: {
    lastFetchedAt: Date;
    updatedAt: Date;
    fetchStatus: 'healthy' | 'degraded' | 'failing';
    consecutiveFailures: number;
    lastContentHash?: string;
    lastArchivedGcsUri?: string;
  },
): Promise<void> {
  const ref = sourceRef(db, sourceId);
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
