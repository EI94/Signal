import { describe, expect, it } from 'vitest';
import { decodeOffsetCursor, encodeOffsetCursor } from './offset-cursor';

describe('offset cursor', () => {
  it('round-trips offset', () => {
    const c = encodeOffsetCursor(50);
    expect(decodeOffsetCursor(c)).toBe(50);
  });

  it('returns 0 for empty or invalid cursor', () => {
    expect(decodeOffsetCursor(undefined)).toBe(0);
    expect(decodeOffsetCursor('not-valid')).toBe(0);
  });
});
