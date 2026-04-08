import type { LatestSignalDocument } from '@signal/contracts';
import { ExtractedEventFamilyMvpSchema } from '@signal/contracts';
import { decodeTimelineCursor } from './entity-timeline-cursor';
import { compareFeedSortDesc } from './feed-cursor';

/**
 * Firestore-only timeline: filter + sort (detected_at desc) + keyset seek within a bounded list.
 */
export function filterAndSortTimelineFromFirestore(
  linked: LatestSignalDocument[],
  params: {
    readonly timelineSignalType?: string;
    readonly timelineStatus?: string;
    readonly timelineMinScore?: number;
    readonly timelineDetectedBefore?: string;
    readonly timelineDetectedAfter?: string;
  },
): LatestSignalDocument[] {
  let rows = linked.filter((doc) => {
    if (!ExtractedEventFamilyMvpSchema.safeParse(doc.signalType).success) return false;
    if (params.timelineSignalType !== undefined && doc.signalType !== params.timelineSignalType) {
      return false;
    }
    if (params.timelineStatus !== undefined && doc.status !== params.timelineStatus) {
      return false;
    }
    if (params.timelineMinScore !== undefined && Math.round(doc.score) < params.timelineMinScore) {
      return false;
    }
    if (params.timelineDetectedBefore !== undefined) {
      const t = new Date(params.timelineDetectedBefore).getTime();
      if (doc.detectedAt.getTime() >= t) return false;
    }
    if (params.timelineDetectedAfter !== undefined) {
      const t = new Date(params.timelineDetectedAfter).getTime();
      if (doc.detectedAt.getTime() <= t) return false;
    }
    return true;
  });
  rows = [...rows].sort((a, b) => compareFeedSortDesc(a, b, 'detected_at_desc'));
  return rows;
}

export function seekAfterTimelineCursor(
  sorted: LatestSignalDocument[],
  cursorRaw: string | undefined,
): number {
  const c = decodeTimelineCursor(cursorRaw);
  if (!c) return 0;
  const anchorMs = new Date(c.detectedAt).getTime();
  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i];
    if (d && d.detectedAt.getTime() === anchorMs && d.signalId === c.signalId) {
      return i + 1;
    }
  }
  return 0;
}
