/** Trim only; Firebase Auth treats email lookup case-insensitively. */
export function normalizeAuthLookupEmail(raw: string): string {
  return raw.trim();
}
