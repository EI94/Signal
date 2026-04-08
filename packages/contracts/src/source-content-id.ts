import { createHash } from 'node:crypto';

/**
 * Deterministic SourceContent id (32 lowercase hex chars).
 * Canonical: first 128 bits of SHA-256(`sourceId` + ':' + `contentFingerprintHex`)
 * where `contentFingerprintHex` is the 64-char lowercase hex SHA-256 of the normalized body
 * (same value as operational `lastContentHash` / fetch fingerprint).
 *
 * @see docs/architecture/canonical-ontology.md (SourceContent.contentId)
 * @see docs/architecture/relationships-and-identity-v1.md
 */
export function deriveSourceContentId(sourceId: string, contentFingerprintHex: string): string {
  const h = createHash('sha256')
    .update(`${sourceId}:${contentFingerprintHex}`, 'utf8')
    .digest('hex');
  return h.slice(0, 32);
}
