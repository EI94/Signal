import type {
  AlertingPreferences,
  GeographicAlertScope,
  LatestSignalDocument,
  MacroRegionCode,
} from '@signal/contracts';

/**
 * ISO-3166 alpha-2 sets per macro region (deterministic, expandable).
 * Used with `provenance.sourceLinkedGeoCodes` on signals when present.
 */
const MACRO_TO_ISO2: Record<MacroRegionCode, readonly string[]> = {
  EUROPE: [
    'AL',
    'AT',
    'BA',
    'BE',
    'BG',
    'CH',
    'CY',
    'CZ',
    'DE',
    'DK',
    'EE',
    'ES',
    'FI',
    'FR',
    'GB',
    'GR',
    'HR',
    'HU',
    'IE',
    'IS',
    'IT',
    'LI',
    'LT',
    'LU',
    'LV',
    'ME',
    'MK',
    'MT',
    'NL',
    'NO',
    'PL',
    'PT',
    'RO',
    'RS',
    'SE',
    'SI',
    'SK',
    'UA',
    'XK',
  ],
  MIDDLE_EAST_AFRICA: [
    'AE',
    'AO',
    'BH',
    'BW',
    'DZ',
    'EG',
    'ET',
    'GH',
    'IL',
    'IQ',
    'JO',
    'KE',
    'KW',
    'LB',
    'LY',
    'MA',
    'NG',
    'OM',
    'QA',
    'SA',
    'SN',
    'TN',
    'TZ',
    'UG',
    'ZA',
    'ZM',
    'ZW',
  ],
  AMERICAS: [
    'AR',
    'BO',
    'BR',
    'CA',
    'CL',
    'CO',
    'CR',
    'DO',
    'EC',
    'GT',
    'HN',
    'JM',
    'MX',
    'PA',
    'PE',
    'PR',
    'PY',
    'SV',
    'US',
    'UY',
    'VE',
  ],
  ASIA_PACIFIC: [
    'BD',
    'BN',
    'CN',
    'HK',
    'ID',
    'IN',
    'JP',
    'KH',
    'KR',
    'LA',
    'LK',
    'MM',
    'MN',
    'MO',
    'MY',
    'NP',
    'PH',
    'PK',
    'SG',
    'TH',
    'TW',
    'VN',
  ],
  OCEANIA: ['AU', 'FJ', 'NC', 'NZ', 'PG'],
};

function allowedIso2ForMacroRegions(regions: readonly MacroRegionCode[]): Set<string> {
  const s = new Set<string>();
  for (const r of regions) {
    for (const c of MACRO_TO_ISO2[r] ?? []) s.add(c);
  }
  return s;
}

export type MonitoringGeoOptions = {
  /**
   * When the user narrowed geography to macro regions, deny signals that have no
   * `provenance.sourceLinkedGeoCodes`. Enable in prod once those codes are reliably backfilled.
   */
  denyWhenNoSourceLinkedGeo?: boolean;
};

export function geographicScopeAllowsSignal(
  signal: LatestSignalDocument,
  scope: GeographicAlertScope | undefined,
  options?: MonitoringGeoOptions,
): boolean {
  if (!scope || scope.coverage === 'world') return true;
  const regions = scope.macroRegions ?? [];
  if (regions.length === 0) return true;

  const allowed = allowedIso2ForMacroRegions(regions);
  const linked = signal.provenance?.sourceLinkedGeoCodes ?? [];
  if (linked.length === 0) {
    if (options?.denyWhenNoSourceLinkedGeo) return false;
    /** Until all signals carry geo enrichment, do not drop alerts on empty codes. */
    return true;
  }
  return linked.some((c) => allowed.has(String(c).toUpperCase()));
}

/**
 * When the member configured `watchedIndexIds`, only signals whose operational tags intersect
 * that list are eligible (same OR semantics as the feed). Signals without `marketIndexTagIds`
 * never match when a watchlist is configured.
 */
export function indexWatchlistAllowsSignal(
  signal: LatestSignalDocument,
  watchedIndexIds: string[] | undefined,
): boolean {
  if (!watchedIndexIds || watchedIndexIds.length === 0) return true;
  const docTags = signal.marketIndexTagIds ?? [];
  if (docTags.length === 0) return false;
  const want = new Set(watchedIndexIds.map((t) => t.toLowerCase()));
  return docTags.some((t) => want.has(String(t).toLowerCase()));
}

export function sourceAllowlistAllowsSignal(
  signal: LatestSignalDocument,
  enabledSourceIds: string[] | undefined,
): boolean {
  if (!enabledSourceIds || enabledSourceIds.length === 0) return true;
  const sid = signal.provenance?.sourceId;
  if (!sid) {
    /** Rollout: older snapshots without `sourceId` still notify until backfilled. */
    return true;
  }
  return enabledSourceIds.includes(sid);
}

export function signalMatchesUserMonitoringFilters(
  signal: LatestSignalDocument,
  alerting: AlertingPreferences,
  options?: MonitoringGeoOptions,
): boolean {
  if (!geographicScopeAllowsSignal(signal, alerting.geographicScope, options)) return false;
  if (!sourceAllowlistAllowsSignal(signal, alerting.enabledSourceIds)) return false;
  if (!indexWatchlistAllowsSignal(signal, alerting.watchedIndexIds)) return false;
  return true;
}
