import { describe, expect, it } from 'vitest';
import { minIntervalMsForBucket, shouldDeferSourceFetchByRatePolicy } from './source-rate-policy';

describe('minIntervalMsForBucket', () => {
  it('maps buckets to expected hours', () => {
    const h = 3_600_000;
    expect(minIntervalMsForBucket('hourly')).toBe(h);
    expect(minIntervalMsForBucket('every_6h')).toBe(6 * h);
    expect(minIntervalMsForBucket('daily')).toBe(24 * h);
    expect(minIntervalMsForBucket('weekly')).toBe(7 * 24 * h);
  });
});

describe('shouldDeferSourceFetchByRatePolicy', () => {
  const bucket = 'daily' as const;
  const day = 24 * 3_600_000;

  it('never defers when policy disabled', () => {
    const last = new Date('2026-04-05T12:00:00.000Z');
    const now = new Date(last.getTime() + 60_000);
    expect(
      shouldDeferSourceFetchByRatePolicy({
        now,
        lastFetchedAt: last,
        bucket,
        policyEnabled: false,
      }).defer,
    ).toBe(false);
  });

  it('never defers without lastFetchedAt', () => {
    const r = shouldDeferSourceFetchByRatePolicy({
      now: new Date('2026-04-05T12:00:00.000Z'),
      lastFetchedAt: undefined,
      bucket,
      policyEnabled: true,
    });
    expect(r.defer).toBe(false);
  });

  it('defers when inside min interval', () => {
    const last = new Date('2026-04-05T12:00:00.000Z');
    const now = new Date(last.getTime() + day / 2);
    const r = shouldDeferSourceFetchByRatePolicy({
      now,
      lastFetchedAt: last,
      bucket,
      policyEnabled: true,
    });
    expect(r.defer).toBe(true);
    if (r.defer) expect(r.reason).toBe('rate_policy_min_interval');
  });

  it('allows fetch after interval', () => {
    const last = new Date('2026-04-05T12:00:00.000Z');
    const now = new Date(last.getTime() + day + 1);
    expect(
      shouldDeferSourceFetchByRatePolicy({
        now,
        lastFetchedAt: last,
        bucket,
        policyEnabled: true,
      }).defer,
    ).toBe(false);
  });
});
