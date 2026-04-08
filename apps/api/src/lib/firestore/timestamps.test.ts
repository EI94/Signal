import { describe, expect, it } from 'vitest';
import { normalizeFirestoreTimestamps } from './timestamps';

describe('normalizeFirestoreTimestamps', () => {
  it('converts Firestore-like timestamp to Date', () => {
    const d = new Date('2020-01-01T00:00:00.000Z');
    const out = normalizeFirestoreTimestamps({
      createdAt: { toDate: () => d },
      other: 1,
    });
    expect(out.createdAt).toEqual(d);
    expect(out.other).toBe(1);
  });
});
