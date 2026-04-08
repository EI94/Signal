import { createHash } from 'node:crypto';

/** RFC-4122-shaped UUID derived deterministically from a string (v4 variant bits). */
export function stringToDeterministicUuid(input: string): string {
  const h = createHash('sha256').update(input.trim()).digest();
  const b = Buffer.from(h.subarray(0, 16));
  const b6 = b[6];
  const b8 = b[8];
  if (b6 === undefined || b8 === undefined) {
    throw new Error('deterministic uuid: buffer too short');
  }
  b[6] = (b6 & 0x0f) | 0x40;
  b[8] = (b8 & 0x3f) | 0x80;
  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function entitySeedId(entityType: string, canonicalName: string): string {
  return stringToDeterministicUuid(
    `entitySeed:${entityType.toLowerCase()}:${canonicalName.trim()}`,
  );
}

export function sourceIdFromCanonicalUrl(canonicalUrl: string): string {
  return stringToDeterministicUuid(`sourceRegistry:${canonicalUrl.trim().toLowerCase()}`);
}

export function watchlistId(workspaceId: string, watchlistName: string): string {
  return stringToDeterministicUuid(`watchlist:${workspaceId}:${watchlistName.trim()}`);
}
