import { createHash } from 'node:crypto';

/**
 * Deterministic id for BigQuery `insertId` / dedupe on retry (not exactly-once).
 */
export function buildUsageMeteringEventId(parts: {
  readonly serviceName: string;
  readonly eventType: string;
  readonly occurredAtIso: string;
  readonly dedupeKey: string;
}): string {
  return createHash('sha256')
    .update(
      [parts.serviceName, parts.eventType, parts.occurredAtIso, parts.dedupeKey].join('|'),
      'utf8',
    )
    .digest('hex')
    .slice(0, 32);
}
