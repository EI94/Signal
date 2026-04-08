import type { CheckFrequencyBucket } from '@signal/contracts';

/**
 * WS10.4 — deterministic minimum interval between HTTP fetches per `checkFrequencyBucket`.
 * Does not replace scheduling; ingest run-once applies this before `fetchUrlOnce`.
 */
export function minIntervalMsForBucket(bucket: CheckFrequencyBucket): number {
  const h = 3_600_000;
  switch (bucket) {
    case 'hourly':
      return h;
    case 'every_6h':
      return 6 * h;
    case 'daily':
      return 24 * h;
    case 'weekly':
      return 7 * 24 * h;
  }
}

export type RatePolicyDeferReason = 'rate_policy_min_interval';

/**
 * When `lastFetchedAt` is missing, always allow fetch (first observation / backfill).
 */
export function shouldDeferSourceFetchByRatePolicy(params: {
  readonly now: Date;
  readonly lastFetchedAt: Date | undefined;
  readonly bucket: CheckFrequencyBucket;
  readonly policyEnabled: boolean;
}): { readonly defer: false } | { readonly defer: true; readonly reason: RatePolicyDeferReason } {
  if (!params.policyEnabled) {
    return { defer: false };
  }
  if (params.lastFetchedAt === undefined) {
    return { defer: false };
  }
  const minMs = minIntervalMsForBucket(params.bucket);
  const elapsed = params.now.getTime() - params.lastFetchedAt.getTime();
  if (elapsed < minMs) {
    return { defer: true, reason: 'rate_policy_min_interval' };
  }
  return { defer: false };
}
