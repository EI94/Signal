import { SOURCE_REGISTRY_COLLECTION } from '@signal/contracts';
import type { Firestore } from 'firebase-admin/firestore';

export async function lookupSourceLabel(db: Firestore, sourceId: string): Promise<string | null> {
  try {
    const snap = await db.collection(SOURCE_REGISTRY_COLLECTION).doc(sourceId).get();
    if (!snap.exists) return null;
    const data = snap.data();
    const name = data?.name;
    return typeof name === 'string' && name.length > 0 ? name : null;
  } catch {
    return null;
  }
}
