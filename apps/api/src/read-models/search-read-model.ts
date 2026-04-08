import type { LatestSignalDocument, SearchResultItem, SearchV1Response } from '@signal/contracts';
import { getCountryNameByIso2 } from '@signal/contracts';
import type { GeographyEntityIndex } from './geography-index';
import { mapLatestToSignalSummaryV1 } from './signal-summary-mapper';

const DEFAULT_LIMIT = 15;
const DEFAULT_WINDOW_HOURS = 168;

export function buildSearchReadModel(params: {
  window: LatestSignalDocument[];
  query: string;
  windowHours?: number;
  limit?: number;
  geoIndex: GeographyEntityIndex;
  windowMax: number;
  scope: 'live_window' | 'token_index';
}): SearchV1Response {
  const { window, query, geoIndex, windowMax, scope } = params;
  const limit = params.limit ?? DEFAULT_LIMIT;
  const windowHours = params.windowHours ?? DEFAULT_WINDOW_HOURS;
  const q = query.toLowerCase().trim();

  const now = new Date();
  const cutoff = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
  const inWindow = window.filter((d) => d.detectedAt.getTime() >= cutoff.getTime());

  const windowCapped = scope === 'live_window' && window.length >= windowMax;

  const results: SearchResultItem[] = [];
  const seenCountries = new Set<string>();
  const seenEntities = new Set<string>();

  for (const doc of inWindow) {
    if (results.length >= limit) break;

    const summary = mapLatestToSignalSummaryV1(doc, geoIndex);
    if (!summary) continue;

    const titleMatch = doc.title.toLowerCase().includes(q);
    const publisherMatch = doc.provenance?.sourceLabel?.toLowerCase().includes(q) ?? false;

    if (titleMatch || publisherMatch) {
      results.push({
        type: 'signal',
        label: summary.title,
        sublabel: summary.sourceLabel ?? null,
        signal: summary,
      });
    }

    for (const ref of doc.entityRefs) {
      const key = `${ref.entityType}:${ref.entityId}`;
      if (seenEntities.has(key)) continue;
      const name = ref.displayName ?? ref.entityId;
      if (name.toLowerCase().includes(q)) {
        seenEntities.add(key);
        results.push({
          type: 'entity',
          label: name,
          sublabel: ref.entityType,
          entityType: ref.entityType,
          entityId: ref.entityId,
        });
      }
    }

    for (const code of summary.countryCodes ?? []) {
      if (seenCountries.has(code)) continue;
      const name = getCountryNameByIso2(code);
      if (name?.toLowerCase().includes(q) || code.toLowerCase().includes(q)) {
        seenCountries.add(code);
        results.push({
          type: 'country',
          label: name ?? code,
          sublabel: code,
          iso2: code,
        });
      }
    }
  }

  if (windowCapped) {
    console.log(
      '[search] window_capped query=%s scope=%s window_size=%d results=%d',
      query,
      scope,
      window.length,
      results.length,
    );
  }

  return {
    query,
    results: results.slice(0, limit),
    totalMatches: results.length,
    scope,
    windowCapped,
  };
}
