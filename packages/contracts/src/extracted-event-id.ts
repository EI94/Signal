import { createHash } from 'node:crypto';

/**
 * Deterministic id for `extracted_events.extracted_event_id` (32 lowercase hex).
 * Stable for the same source content + family + match signature across retries.
 */
export function deriveExtractedEventId(params: {
  sourceContentId: string;
  eventFamily: string;
  /** Stable description of the match (e.g. sorted keywords + snippet hash). */
  matchSignature: string;
}): string {
  return createHash('sha256')
    .update(`${params.sourceContentId}:${params.eventFamily}:${params.matchSignature}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
}

/** Short stable fingerprint from matched keywords and a text window. */
export function buildMatchSignature(params: {
  matchedTerms: readonly string[];
  evidenceSnippet: string;
  /** Disambiguate multiple matches of the same family in one document. */
  ordinal: number;
}): string {
  const terms = [...params.matchedTerms].sort().join('|');
  const snippetHash = createHash('sha256')
    .update(params.evidenceSnippet.replace(/\s+/g, ' ').trim().slice(0, 500), 'utf8')
    .digest('hex')
    .slice(0, 24);
  return `${params.ordinal}:${terms}:${snippetHash}`;
}
