import type {
  BriefDetailV1Response,
  BriefsListV1Response,
  CursorPaginationQueryV1,
  WorkspaceScopeQueryV1,
} from '@signal/contracts';

/** WS6.1 list query is cursor pagination + optional workspace scope (scope enforced in routes). */
export type BriefsListQueryInput = CursorPaginationQueryV1 & WorkspaceScopeQueryV1;

import { getFirestoreDb } from '../lib/firebase-admin';
import { parseBriefDocument } from '../lib/firestore/parse-documents';
import { workspaceBriefsCollection } from '../lib/firestore/workspace-collections';
import { decodeOffsetCursor, encodeOffsetCursor } from './offset-cursor';

const FETCH_MAX = 200;

function briefMetadataFromDoc(briefId: string, d: import('@signal/contracts').BriefDocument) {
  return {
    briefId,
    briefType: d.briefType,
    title: d.title,
    periodStart: d.periodStart.toISOString(),
    periodEnd: d.periodEnd.toISOString(),
    status: d.status,
    summaryRef: d.summaryRef,
    updatedAt: d.updatedAt.toISOString(),
  };
}

export async function buildBriefsListReadModel(params: {
  readonly workspaceId: string;
  readonly query: BriefsListQueryInput;
}): Promise<BriefsListV1Response> {
  const { workspaceId, query } = params;
  const db = getFirestoreDb();
  const col = workspaceBriefsCollection(db, workspaceId);
  const snap = await col.orderBy('updatedAt', 'desc').limit(FETCH_MAX).get();

  const rows: ReturnType<typeof briefMetadataFromDoc>[] = [];
  for (const doc of snap.docs) {
    const parsed = parseBriefDocument(doc.data());
    if (!parsed.success) continue;
    rows.push(briefMetadataFromDoc(doc.id, parsed.data));
  }

  const limit = Math.min(100, Math.max(1, query.limit ?? 50));
  const offset = decodeOffsetCursor(query.cursor);
  const slice = rows.slice(offset, offset + limit);
  const hasMore = offset + limit < rows.length;

  return {
    workspaceId,
    items: slice,
    nextPageToken: hasMore ? encodeOffsetCursor(offset + limit) : null,
  };
}

export async function buildBriefDetailReadModel(params: {
  readonly workspaceId: string;
  readonly briefId: string;
}): Promise<BriefDetailV1Response | null> {
  const { workspaceId, briefId } = params;
  const db = getFirestoreDb();
  const col = workspaceBriefsCollection(db, workspaceId);
  const snap = await col.doc(briefId).get();
  if (!snap.exists) return null;
  const parsed = parseBriefDocument(snap.data());
  if (!parsed.success) return null;
  return briefMetadataFromDoc(briefId, parsed.data);
}
