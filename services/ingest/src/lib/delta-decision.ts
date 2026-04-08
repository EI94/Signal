import type { IngestFetchDeltaOutcome } from '@signal/contracts';

/**
 * Compare new fingerprint hash to last persisted hash on the source registry row.
 * Not canonical history — operational delta for fetch loop only.
 */
export function decideFetchDelta(params: {
  newHashHex: string;
  previousHash: string | undefined;
}): IngestFetchDeltaOutcome {
  const prev = params.previousHash?.trim();
  if (!prev) {
    return 'first_seen';
  }
  if (prev === params.newHashHex) {
    return 'unchanged';
  }
  return 'changed';
}
