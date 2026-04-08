/**
 * Builds a dynamic CORS origin checker for @fastify/cors.
 *
 * Supports exact origins (`https://example.com`) and wildcard patterns
 * (`https://*.example.com`). A single `*` segment matches one or more
 * URL-safe characters (`[a-z0-9-]`).
 *
 * Non-browser requests (no Origin header) are always allowed.
 */
export function buildCorsOriginChecker(
  origins: readonly string[],
): (origin: string | undefined, callback: (err: Error | null, result: boolean) => void) => void {
  const exact = new Set<string>();
  const patterns: RegExp[] = [];

  for (const entry of origins) {
    if (entry.includes('*')) {
      const parts = entry.split('*');
      const escaped = parts.map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]+');
      patterns.push(new RegExp(`^${escaped}$`));
    } else {
      exact.add(entry);
    }
  }

  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (exact.has(origin)) {
      callback(null, true);
      return;
    }
    for (const p of patterns) {
      if (p.test(origin)) {
        callback(null, true);
        return;
      }
    }
    callback(null, false);
  };
}
