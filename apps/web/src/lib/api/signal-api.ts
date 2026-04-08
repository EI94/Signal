/**
 * Public API base URL for browser calls to apps/api (no secrets).
 * Example: http://localhost:4000 — no trailing slash.
 */
export function getSignalApiBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SIGNAL_API_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}
