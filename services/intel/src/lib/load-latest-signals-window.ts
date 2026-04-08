import type { LatestSignalDocument } from '@signal/contracts';
import { LatestSignalDocumentSchema } from '@signal/contracts';
import type admin from 'firebase-admin';

/** Matches apps/api `SIGNALS_LATEST_WINDOW_MAX` for consistent windows. */
export const SIGNALS_LATEST_WINDOW_MAX = 500;

export async function loadLatestSignalsWindowForBrief(
  db: admin.firestore.Firestore,
  workspaceId: string,
): Promise<LatestSignalDocument[]> {
  const snap = await db
    .collection('workspaces')
    .doc(workspaceId)
    .collection('signalsLatest')
    .orderBy('detectedAt', 'desc')
    .limit(SIGNALS_LATEST_WINDOW_MAX)
    .get();

  const out: LatestSignalDocument[] = [];
  for (const doc of snap.docs) {
    const parsed = LatestSignalDocumentSchema.safeParse(doc.data());
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
