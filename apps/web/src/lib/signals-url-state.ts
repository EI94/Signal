import type { FeedFilters } from './api/fetch-signals-feed';

/** Sort values supported by the signals feed UI and GET `/v1/signals` (WS6.3). */
const SIGNAL_FEED_SORT_VALUES = new Set(['detected_at_desc', 'occurred_at_desc', 'score_desc']);

/**
 * Parse dashboard `/signals` query params into {@link FeedFilters}.
 * Does not read cursor, limit, or includeFacets — those stay client-only for fetch.
 */
export function parseSignalsFeedSearchParams(searchParams: URLSearchParams): FeedFilters {
  const out: FeedFilters = {};
  const signalType = searchParams.get('signalType');
  if (signalType) out.signalType = signalType;
  const sort = searchParams.get('sort');
  if (sort && SIGNAL_FEED_SORT_VALUES.has(sort)) out.sort = sort;
  const minScoreRaw = searchParams.get('minScore');
  if (minScoreRaw !== null && minScoreRaw !== '') {
    const n = Number(minScoreRaw);
    if (Number.isFinite(n)) {
      const rounded = Math.trunc(n);
      if (rounded > 0 && rounded <= 100) out.minScore = rounded;
    }
  }
  const novelty = searchParams.get('novelty');
  if (novelty) out.novelty = novelty;
  const search = searchParams.get('q');
  if (search) out.search = search;
  return out;
}

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/** Parse Next.js `searchParams` record (App Router) into {@link FeedFilters}. */
export function parseSignalsFeedSearchParamsFromRecord(
  sp: Record<string, string | string[] | undefined>,
): FeedFilters {
  const u = new URLSearchParams();
  const st = firstParam(sp.signalType);
  if (st) u.set('signalType', st);
  const sort = firstParam(sp.sort);
  if (sort) u.set('sort', sort);
  const ms = firstParam(sp.minScore);
  if (ms !== undefined && ms !== '') u.set('minScore', ms);
  const novelty = firstParam(sp.novelty);
  if (novelty) u.set('novelty', novelty);
  const q = firstParam(sp.q);
  if (q) u.set('q', q);
  return parseSignalsFeedSearchParams(u);
}

/**
 * Serialize filter state to a query string (no leading `?`).
 * Omits empty defaults; omits `minScore` when 0 or undefined.
 */
export function serializeSignalsFeedFiltersToQueryString(filters: FeedFilters): string {
  const p = new URLSearchParams();
  if (filters.signalType) p.set('signalType', filters.signalType);
  if (filters.sort) p.set('sort', filters.sort);
  if (filters.minScore !== undefined && filters.minScore > 0) {
    p.set('minScore', String(filters.minScore));
  }
  if (filters.novelty) p.set('novelty', filters.novelty);
  if (filters.search) p.set('q', filters.search);
  return p.toString();
}

/** Path + query for `router.replace` (e.g. `/signals` or `/signals?signalType=...`). */
export function buildSignalsPagePath(filters: FeedFilters): string {
  const qs = serializeSignalsFeedFiltersToQueryString(filters);
  return qs ? `/signals?${qs}` : '/signals';
}
