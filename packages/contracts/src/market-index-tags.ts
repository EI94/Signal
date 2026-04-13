/**
 * Canonical tokens for `AlertingPreferences.watchedIndexIds`, GET `/v1/signals?marketIndexTags=`,
 * and `LatestSignalDocument.marketIndexTagIds` (lowercase, trimmed, deduped, max 32).
 */
export function normalizeMarketIndexTagIds(
  ids: readonly string[] | undefined | null,
): string[] {
  if (!ids?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const t = String(raw).trim().toLowerCase();
    if (t.length === 0) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 32) break;
  }
  return out;
}
