import type { LatestSignalDocument, SignalsFeedQueryV1 } from '@signal/contracts';

export type SignalsFeedSort = NonNullable<SignalsFeedQueryV1['sort']>;

/** v1: legacy offset into the sorted filtered list (WS6.2). */
export type FeedOffsetCursor = { readonly v: 1; readonly o: number };

/**
 * v2: keyset anchor — last row of the previous page. Next page starts at the row strictly after this in descending sort order.
 */
export type FeedKeysetCursor = {
  readonly v: 2;
  readonly sort: SignalsFeedSort;
  /**
   * Primary key for the active sort: `detectedAt` ms, `occurredAt` ms, or rounded `score` (0–100).
   */
  readonly primary: number;
  readonly signalId: string;
};

export type FeedCursorPayload = FeedOffsetCursor | FeedKeysetCursor;

export function encodeFeedCursor(payload: FeedCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeFeedCursor(raw: string | undefined): FeedCursorPayload | null {
  if (!raw || raw.trim() === '') return null;
  try {
    const buf = Buffer.from(raw, 'base64url');
    const parsed = JSON.parse(buf.toString('utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const o = parsed as Record<string, unknown>;
    if (o.v === 1 && typeof o.o === 'number' && Number.isInteger(o.o) && o.o >= 0) {
      return { v: 1, o: o.o };
    }
    if (
      o.v === 2 &&
      (o.sort === 'detected_at_desc' || o.sort === 'occurred_at_desc' || o.sort === 'score_desc') &&
      typeof o.primary === 'number' &&
      Number.isFinite(o.primary) &&
      typeof o.signalId === 'string' &&
      o.signalId.length >= 1
    ) {
      return {
        v: 2,
        sort: o.sort,
        primary: o.primary,
        signalId: o.signalId,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function encodeFeedCursorFromDoc(doc: LatestSignalDocument, sort: SignalsFeedSort): string {
  let primary: number;
  switch (sort) {
    case 'occurred_at_desc':
      primary = doc.occurredAt.getTime();
      break;
    case 'score_desc':
      primary = Math.round(doc.score);
      break;
    default:
      primary = doc.detectedAt.getTime();
      break;
  }
  const payload: FeedKeysetCursor = { v: 2, sort, primary, signalId: doc.signalId };
  return encodeFeedCursor(payload);
}

/** Compare a vs b in descending order for the given sort; return >0 if a should appear before b. */
export function compareFeedSortDesc(
  a: LatestSignalDocument,
  b: LatestSignalDocument,
  sort: SignalsFeedSort,
): number {
  switch (sort) {
    case 'occurred_at_desc': {
      const t = b.occurredAt.getTime() - a.occurredAt.getTime();
      if (t !== 0) return t;
      return b.signalId.localeCompare(a.signalId);
    }
    case 'score_desc': {
      const sa = Math.round(a.score);
      const sb = Math.round(b.score);
      if (sb !== sa) return sb - sa;
      return b.signalId.localeCompare(a.signalId);
    }
    default: {
      const t = b.detectedAt.getTime() - a.detectedAt.getTime();
      if (t !== 0) return t;
      return b.signalId.localeCompare(a.signalId);
    }
  }
}

function keysetMatchesDoc(cursor: FeedKeysetCursor, doc: LatestSignalDocument): boolean {
  if (doc.signalId !== cursor.signalId) return false;
  switch (cursor.sort) {
    case 'occurred_at_desc':
      return doc.occurredAt.getTime() === cursor.primary;
    case 'score_desc':
      return Math.round(doc.score) === cursor.primary;
    default:
      return doc.detectedAt.getTime() === cursor.primary;
  }
}

/**
 * Start index for the next page after a keyset anchor. If the anchor row is missing, returns 0.
 */
export function findStartIndexAfterKeyset(
  sorted: LatestSignalDocument[],
  cursor: FeedKeysetCursor,
): number {
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    if (row && keysetMatchesDoc(cursor, row)) {
      return i + 1;
    }
  }
  return 0;
}
