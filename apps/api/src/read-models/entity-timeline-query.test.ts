import type { LatestSignalDocument } from '@signal/contracts';
import { describe, expect, it } from 'vitest';
import { encodeTimelineCursor } from './entity-timeline-cursor';
import {
  filterAndSortTimelineFromFirestore,
  seekAfterTimelineCursor,
} from './entity-timeline-query';

function doc(id: string, detected: string, score = 50): LatestSignalDocument {
  const d = new Date(detected);
  return {
    signalId: id,
    signalType: 'project_award',
    title: id,
    entityRefs: [],
    score,
    status: 'active',
    occurredAt: d,
    detectedAt: d,
    updatedAt: d,
  };
}

describe('entity timeline Firestore path', () => {
  it('seeks after timeline cursor', () => {
    const rows = [doc('a', '2026-04-03T12:00:00.000Z'), doc('b', '2026-04-02T12:00:00.000Z')];
    const sorted = filterAndSortTimelineFromFirestore(rows, {});
    const row = sorted[0];
    if (!row) {
      throw new Error('expected row');
    }
    const c = encodeTimelineCursor(row.detectedAt, row.signalId);
    const start = seekAfterTimelineCursor(sorted, c);
    expect(start).toBe(1);
  });
});
