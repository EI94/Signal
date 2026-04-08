import { randomUUID } from 'node:crypto';

/** Inbound client/proxy IDs: UUID-like, no spaces, bounded length (no raw injection). */
export function isValidInboundRequestId(s: string): boolean {
  const t = s.trim();
  if (t.length < 8 || t.length > 128) return false;
  return /^[A-Za-z0-9-]+$/.test(t);
}

/**
 * Prefer a valid `X-Request-Id` when present; otherwise generate a new UUID.
 */
export function getOrCreateRequestId(headerValue: string | string[] | undefined): string {
  if (typeof headerValue === 'string') {
    const v = headerValue.trim();
    if (isValidInboundRequestId(v)) {
      return v;
    }
  }
  return randomUUID();
}
