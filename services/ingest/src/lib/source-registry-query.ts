import {
  SOURCE_REGISTRY_COLLECTION,
  type SourceRegistryDocument,
  SourceRegistryDocumentSchema,
} from '@signal/contracts';
import type admin from 'firebase-admin';
import { normalizeFirestoreTimestamps } from './firestore-timestamps';

function parseDoc(raw: Record<string, unknown>) {
  return SourceRegistryDocumentSchema.safeParse(normalizeFirestoreTimestamps(raw));
}

export async function listActiveSources(
  db: admin.firestore.Firestore,
): Promise<SourceRegistryDocument[]> {
  const snap = await db.collection(SOURCE_REGISTRY_COLLECTION).where('isActive', '==', true).get();
  const out: SourceRegistryDocument[] = [];
  for (const doc of snap.docs) {
    const parsed = parseDoc(doc.data() as Record<string, unknown>);
    if (parsed.success) {
      out.push(parsed.data);
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function getActiveSourceById(
  db: admin.firestore.Firestore,
  sourceId: string,
): Promise<SourceRegistryDocument | null> {
  const snap = await db.collection(SOURCE_REGISTRY_COLLECTION).doc(sourceId).get();
  if (!snap.exists) {
    return null;
  }
  const parsed = parseDoc((snap.data() ?? {}) as Record<string, unknown>);
  if (!parsed.success || parsed.data.sourceId !== sourceId || !parsed.data.isActive) {
    return null;
  }
  return parsed.data;
}
