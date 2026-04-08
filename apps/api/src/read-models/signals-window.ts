import type { LatestSignalDocument } from '@signal/contracts';
import type admin from 'firebase-admin';
import { parseLatestSignalDocument } from '../lib/firestore/parse-documents';
import { workspaceSignalsLatestCollection } from '../lib/firestore/workspace-collections';

/** Hard cap: read model scans at most this many latest signals per request (deterministic window). */
export const SIGNALS_LATEST_WINDOW_MAX = 500;

export async function loadLatestSignalsWindow(
  db: admin.firestore.Firestore,
  workspaceId: string,
): Promise<LatestSignalDocument[]> {
  const col = workspaceSignalsLatestCollection(db, workspaceId);
  const snap = await col.orderBy('detectedAt', 'desc').limit(SIGNALS_LATEST_WINDOW_MAX).get();
  const out: LatestSignalDocument[] = [];
  for (const doc of snap.docs) {
    const parsed = parseLatestSignalDocument(doc.data());
    if (parsed.success) {
      out.push(parsed.data);
    }
  }
  return out;
}
