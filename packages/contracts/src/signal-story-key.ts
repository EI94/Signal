import { createHash } from 'node:crypto';
import type { EntityRef } from './firestore-operational';

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'the',
  'to',
  'was',
  'with',
]);

/**
 * Canonical “story” fingerprint for cross-signal deduplication (alerts, digest, UI).
 * Same real-world item re-ingested from another URL should usually match via ordered title stem
 * + entity keys + signal family; when `sourceUrl` is stable, it tightens the match.
 *
 * Not a cryptographic content ID — collision resistance is “product good enough”, like feed dedupers.
 */
export function computeSignalStoryKey(signal: {
  signalType: string;
  title: string;
  entityRefs: readonly EntityRef[];
  provenance?: { sourceUrl?: string | undefined } | null;
}): string {
  const entityKey = [...signal.entityRefs]
    .map((r) => `${r.entityType}:${r.entityId}`)
    .sort()
    .join('|');

  const urlCanon = canonicalSourceUrl(signal.provenance?.sourceUrl);
  const stem = titleOrderedStem(signal.title);

  const payload = urlCanon
    ? `${signal.signalType}|${entityKey}|${stem}|url:${urlCanon}`
    : `${signal.signalType}|${entityKey}|${stem}`;

  return createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 32);
}

function canonicalSourceUrl(raw?: string | null): string {
  if (!raw?.trim()) return '';
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    let path = u.pathname.replace(/\/$/, '').toLowerCase();
    if (path === '') path = '/';
    return `${host}${path}`;
  } catch {
    return '';
  }
}

/** First significant words in reading order (stops syndicated headlines that permute the same tokens). */
function titleOrderedStem(title: string): string {
  const cleaned = title
    .toLowerCase()
    .replace(/[—–\-_/]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const words = cleaned
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
  return words.slice(0, 14).join(' ');
}
