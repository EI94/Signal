/**
 * Extract a Bearer token from an Authorization header value.
 * Returns null if missing or malformed (RFC 6750-style).
 */
export function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader || typeof authorizationHeader !== 'string') return null;
  const trimmed = authorizationHeader.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null;
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : null;
}
