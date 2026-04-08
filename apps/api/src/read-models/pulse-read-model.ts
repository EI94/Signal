import type {
  CountryStatus,
  LatestSignalDocument,
  PulseV1Response,
  SignalSummaryV1,
} from '@signal/contracts';
import { getCountryNameByIso2 } from '@signal/contracts';
import type { GeographyEntityIndex } from './geography-index';
import { mapLatestToSignalSummaryV1 } from './signal-summary-mapper';

const RISK_TYPES = new Set(['ma_divestment']);
const POSITIVE_TYPES = new Set(['project_award', 'partnership_mou', 'technology_milestone']);

function classifyCountryStatus(signals: SignalSummaryV1[]): 'red' | 'yellow' | 'green' | 'neutral' {
  if (signals.length === 0) return 'neutral';

  const maxScore = Math.max(...signals.map((s) => s.compositeScore ?? 0));
  let riskWeight = 0;
  let positiveWeight = 0;

  for (const s of signals) {
    const score = s.compositeScore ?? 0;
    if (RISK_TYPES.has(s.signalType)) {
      riskWeight += score;
    }
    if (POSITIVE_TYPES.has(s.signalType)) {
      positiveWeight += score;
    }
  }

  if (riskWeight > 0 && (riskWeight >= positiveWeight || maxScore >= 60)) return 'red';
  if (positiveWeight > 0) return 'green';
  if (signals.length > 0) return 'yellow';
  return 'neutral';
}

export function buildPulseReadModel(params: {
  window: LatestSignalDocument[];
  windowHours: number;
  geoIndex: GeographyEntityIndex;
  countryFilter?: string;
}): PulseV1Response {
  const { window, windowHours, geoIndex, countryFilter } = params;
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

  const inWindow = window.filter((d) => d.detectedAt.getTime() >= cutoff.getTime());

  const allSummaries = inWindow
    .map((d) => mapLatestToSignalSummaryV1(d, geoIndex))
    .filter((x): x is SignalSummaryV1 => x !== null);

  const attrCounts: Record<string, number> = {
    explicit_geography: 0,
    source_linked_geography: 0,
    text_inferred_geography: 0,
    hq_fallback: 0,
    none: 0,
  };
  for (const s of allSummaries) {
    const key = s.countryAttributionMode ?? 'none';
    attrCounts[key] = (attrCounts[key] ?? 0) + 1;
  }
  const publishedCount = allSummaries.filter((s) => s.sourceTimeSemantic === 'published').length;
  console.log(
    '[pulse] attribution=%j published=%d/%d',
    attrCounts,
    publishedCount,
    allSummaries.length,
  );

  const byCountry = new Map<string, SignalSummaryV1[]>();
  for (const s of allSummaries) {
    const codes = s.countryCodes ?? [];
    if (codes.length === 0) {
      const list = byCountry.get('__none') ?? [];
      list.push(s);
      byCountry.set('__none', list);
    }
    for (const code of codes) {
      const list = byCountry.get(code) ?? [];
      list.push(s);
      byCountry.set(code, list);
    }
  }

  const countries: CountryStatus[] = [];
  for (const [iso2, signals] of byCountry) {
    if (iso2 === '__none') continue;
    const name = getCountryNameByIso2(iso2) ?? iso2;
    const sorted = [...signals].sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));
    countries.push({
      iso2,
      name,
      signalCount: signals.length,
      status: classifyCountryStatus(signals),
      topSignalTitle: sorted[0]?.title ?? null,
      topSignalScore: sorted[0]?.compositeScore ?? null,
    });
  }

  countries.sort((a, b) => b.signalCount - a.signalCount);

  let filtered = allSummaries;
  if (countryFilter) {
    filtered = allSummaries.filter((s) => s.countryCodes?.includes(countryFilter));
  }

  const topSignals = [...filtered]
    .sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0))
    .slice(0, 30);

  return {
    generatedAt: now.toISOString(),
    windowHours,
    totalSignals: allSummaries.length,
    countries,
    topSignals,
    allSignals: filtered.slice(0, 200),
  };
}
