import type { LatestSignalDocument, MapSignalPointV1, MapSignalsQueryV1 } from '@signal/contracts';
import { ExtractedEventFamilyMvpSchema } from '@signal/contracts';
import { decodeOffsetCursor, encodeOffsetCursor } from './offset-cursor';
import { mapLatestToSignalSummaryV1 } from './signal-summary-mapper';

function matchesMapFilters(doc: LatestSignalDocument, query: MapSignalsQueryV1): boolean {
  if (!ExtractedEventFamilyMvpSchema.safeParse(doc.signalType).success) {
    return false;
  }
  if (query.signalType !== undefined && doc.signalType !== query.signalType) {
    return false;
  }
  if (query.minScore !== undefined && Math.round(doc.score) < query.minScore) {
    return false;
  }
  return true;
}

function toMapPoint(
  summary: NonNullable<ReturnType<typeof mapLatestToSignalSummaryV1>>,
): MapSignalPointV1 {
  const primary = summary.primaryEntityRefs?.[0];
  const regionKey = primary ? `${primary.entityType}:${primary.entityId}` : undefined;
  return {
    ...summary,
    ...(regionKey ? { regionKey } : {}),
  };
}

/**
 * Map-ready points from the same bounded window as the feed; no geocoding.
 */
export function buildMapSignalsFromWindow(
  window: LatestSignalDocument[],
  query: MapSignalsQueryV1,
): { points: MapSignalPointV1[]; nextPageToken: string | null } {
  const rows = window.filter((d) => matchesMapFilters(d, query));
  rows.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());

  const limit = Math.min(500, Math.max(1, query.limit ?? 100));
  const offset = decodeOffsetCursor(query.cursor);
  const pageDocs = rows.slice(offset, offset + limit);
  const hasMore = offset + limit < rows.length;

  const points = pageDocs
    .map((d) => mapLatestToSignalSummaryV1(d))
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .map(toMapPoint);

  const nextPageToken = hasMore ? encodeOffsetCursor(offset + limit) : null;
  return { points, nextPageToken };
}
