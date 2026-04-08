import { describe, expect, it } from 'vitest';
import { isStaleByAgeMs } from './compute-stale';

describe('isStaleByAgeMs', () => {
  const now = Date.parse('2026-04-05T12:00:00.000Z');

  it('treats null as stale', () => {
    expect(isStaleByAgeMs(now, null, 24)).toBe(true);
  });

  it('is fresh when within threshold', () => {
    const recent = Date.parse('2026-04-05T00:00:00.000Z'); // 12h ago
    expect(isStaleByAgeMs(now, recent, 24)).toBe(false);
  });

  it('is stale when older than threshold', () => {
    const old = Date.parse('2026-04-01T12:00:00.000Z');
    expect(isStaleByAgeMs(now, old, 24)).toBe(true);
  });
});
