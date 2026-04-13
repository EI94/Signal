import type {
  LatestSignalDocument,
  SignalSummaryV1,
  SignalsFeedFacetsV1,
  SignalsFeedQueryV1,
} from '@signal/contracts';
import { ExtractedEventFamilyMvpSchema } from '@signal/contracts';
import {
  compareFeedSortDesc,
  decodeFeedCursor,
  encodeFeedCursorFromDoc,
  findStartIndexAfterKeyset,
} from './feed-cursor';
import type { GeographyEntityIndex } from './geography-index';
import { mapLatestToSignalSummaryV1 } from './signal-summary-mapper';

function entityRefMatches(
  doc: LatestSignalDocument,
  entityType: string,
  entityId: string,
): boolean {
  return doc.entityRefs.some((e) => e.entityType === entityType && e.entityId === entityId);
}

function marketIndexTagsMatch(doc: LatestSignalDocument, wanted: readonly string[]): boolean {
  const docTags = doc.marketIndexTagIds ?? [];
  if (docTags.length === 0) return false;
  const want = new Set(wanted.map((t) => t.toLowerCase()));
  return docTags.some((t) => want.has(String(t).toLowerCase()));
}

/**
 * Applies all feed filters supported by the bounded `signalsLatest` window (WS6.3).
 */
export function filterSignalsForFeed(
  docs: LatestSignalDocument[],
  query: SignalsFeedQueryV1,
): LatestSignalDocument[] {
  return docs.filter((doc) => {
    if (!ExtractedEventFamilyMvpSchema.safeParse(doc.signalType).success) {
      return false;
    }
    if (query.signalType !== undefined && doc.signalType !== query.signalType) {
      return false;
    }
    if (query.status !== undefined && doc.status !== query.status) {
      return false;
    }
    if (query.novelty !== undefined && doc.novelty !== query.novelty) {
      return false;
    }
    if (query.minScore !== undefined && Math.round(doc.score) < query.minScore) {
      return false;
    }
    if (query.entityType !== undefined && query.entityId !== undefined) {
      if (!entityRefMatches(doc, query.entityType, query.entityId)) {
        return false;
      }
    }
    if (query.detectedAfter !== undefined) {
      const t = new Date(query.detectedAfter).getTime();
      if (doc.detectedAt.getTime() < t) return false;
    }
    if (query.detectedBefore !== undefined) {
      const t = new Date(query.detectedBefore).getTime();
      if (doc.detectedAt.getTime() > t) return false;
    }
    if (query.occurredAfter !== undefined) {
      const t = new Date(query.occurredAfter).getTime();
      if (doc.occurredAt.getTime() < t) return false;
    }
    if (query.occurredBefore !== undefined) {
      const t = new Date(query.occurredBefore).getTime();
      if (doc.occurredAt.getTime() > t) return false;
    }
    if (query.marketIndexTags !== undefined && query.marketIndexTags.length > 0) {
      if (!marketIndexTagsMatch(doc, query.marketIndexTags)) return false;
    }
    return true;
  });
}

/** Counts from the fully filtered list (same basis as the visible feed). */
export function computeSignalsFeedFacets(docs: LatestSignalDocument[]): SignalsFeedFacetsV1 {
  const byType = new Map<string, number>();
  const byStatus = new Map<string, number>();
  const byNovelty = new Map<string, number>();
  for (const d of docs) {
    if (!ExtractedEventFamilyMvpSchema.safeParse(d.signalType).success) continue;
    byType.set(d.signalType, (byType.get(d.signalType) ?? 0) + 1);
    byStatus.set(d.status, (byStatus.get(d.status) ?? 0) + 1);
    const nKey = d.novelty ?? '';
    byNovelty.set(nKey, (byNovelty.get(nKey) ?? 0) + 1);
  }
  const toArr = (m: Map<string, number>, cap: number): SignalsFeedFacetsV1['signalTypes'] => {
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, cap)
      .map(([value, count]) => ({ value, count }));
  };
  return {
    signalTypes: toArr(byType, 32),
    statuses: toArr(byStatus, 64),
    novelties: toArr(byNovelty, 32),
  };
}

export function buildSignalsFeedFromWindow(
  window: LatestSignalDocument[],
  query: SignalsFeedQueryV1,
  geoIndex?: GeographyEntityIndex | null,
): {
  items: SignalSummaryV1[];
  nextPageToken: string | null;
  facets?: SignalsFeedFacetsV1;
} {
  const sort = query.sort ?? 'detected_at_desc';
  const filtered = filterSignalsForFeed(window, query);
  const facets = query.includeFacets === false ? undefined : computeSignalsFeedFacets(filtered);

  const sorted = [...filtered].sort((a, b) => compareFeedSortDesc(a, b, sort));

  const limit = Math.min(100, Math.max(1, query.limit ?? 50));
  const decoded = decodeFeedCursor(query.cursor);
  let start = 0;

  if (decoded?.v === 1) {
    start = Math.min(decoded.o, sorted.length);
  } else if (decoded?.v === 2 && decoded.sort === sort) {
    start = findStartIndexAfterKeyset(sorted, decoded);
  } else if (decoded?.v === 2 && decoded.sort !== sort) {
    start = 0;
  }

  const pageDocs = sorted.slice(start, start + limit);
  const hasMore = start + limit < sorted.length;

  let nextPageToken: string | null = null;
  if (hasMore) {
    const last = pageDocs[pageDocs.length - 1];
    if (last) {
      nextPageToken = encodeFeedCursorFromDoc(last, sort);
    }
  }

  const items = pageDocs
    .map((d) => mapLatestToSignalSummaryV1(d, geoIndex))
    .filter((x): x is SignalSummaryV1 => x !== null);

  return { items, nextPageToken, ...(facets ? { facets } : {}) };
}
