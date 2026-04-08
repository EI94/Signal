import type { LatestSignalDocument } from '@signal/contracts';
import type admin from 'firebase-admin';
import { parseLatestSignalDocument } from '../lib/firestore/parse-documents';
import { workspaceSignalsLatestCollection } from '../lib/firestore/workspace-collections';

const TOKEN_RE = /[a-zA-Z0-9\u00C0-\u024F]{2,}/g;
const TOKEN_SEARCH_LIMIT = 50;

/**
 * Extract the longest meaningful token from a search query.
 * Returns null if no usable token found (too short, etc.).
 */
export function extractSearchToken(query: string): string | null {
  const matches = query.matchAll(TOKEN_RE);
  let best: string | null = null;
  for (const m of matches) {
    const t = m[0].toLowerCase();
    if (!best || t.length > best.length) best = t;
  }
  return best && best.length >= 3 ? best : null;
}

/**
 * Query Firestore signalsLatest using the searchTokens array-contains index.
 * Only works for documents that have searchTokens populated (new signals).
 * Returns up to TOKEN_SEARCH_LIMIT documents sorted by detectedAt desc.
 */
export async function loadSignalsBySearchToken(
  db: admin.firestore.Firestore,
  workspaceId: string,
  token: string,
): Promise<LatestSignalDocument[]> {
  const col = workspaceSignalsLatestCollection(db, workspaceId);
  const snap = await col
    .where('searchTokens', 'array-contains', token)
    .orderBy('detectedAt', 'desc')
    .limit(TOKEN_SEARCH_LIMIT)
    .get();

  const out: LatestSignalDocument[] = [];
  for (const doc of snap.docs) {
    const parsed = parseLatestSignalDocument(doc.data());
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
