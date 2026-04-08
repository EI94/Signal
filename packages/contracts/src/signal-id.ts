import { createHash } from 'node:crypto';

/**
 * Deterministic `signals.signal_id` (32 lowercase hex), stable across retries for the same
 * ExtractedEvent → Signal promotion (MVP: one Signal per ExtractedEvent, signal_type == event_family).
 */
export function deriveSignalId(params: { extractedEventId: string; signalType: string }): string {
  return createHash('sha256')
    .update(`${params.extractedEventId}:${params.signalType}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
}
