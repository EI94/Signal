import type { LatestSignalDocument } from '@signal/contracts';
import { describe, expect, it } from 'vitest';
import {
  decodeFeedCursor,
  encodeFeedCursorFromDoc,
  findStartIndexAfterKeyset,
} from './feed-cursor';

function base(overrides: Partial<LatestSignalDocument> = {}): LatestSignalDocument {
  const t = new Date('2026-04-01T12:00:00.000Z');
  return {
    signalId: 's1',
    signalType: 'project_award',
    title: 'T',
    entityRefs: [],
    score: 80,
    status: 'active',
    occurredAt: t,
    detectedAt: t,
    updatedAt: t,
    ...overrides,
  };
}

describe('feed keyset cursor', () => {
  it('finds start index after anchor for detected_at_desc', () => {
    const t0 = new Date('2026-04-02T12:00:00.000Z');
    const t1 = new Date('2026-04-01T12:00:00.000Z');
    const sorted = [
      base({ signalId: 'a', detectedAt: t0 }),
      base({ signalId: 'b', detectedAt: t1 }),
    ];
    const first = sorted[0];
    if (!first) {
      throw new Error('expected row');
    }
    const enc = encodeFeedCursorFromDoc(first, 'detected_at_desc');
    const cur = decodeFeedCursor(enc);
    expect(cur?.v).toBe(2);
    if (cur?.v !== 2) throw new Error('expected v2');
    const start = findStartIndexAfterKeyset(sorted, cur);
    expect(start).toBe(1);
  });
});
