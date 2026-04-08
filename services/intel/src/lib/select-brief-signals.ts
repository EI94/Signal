import type { LatestSignalDocument, MorningBriefType } from '@signal/contracts';

/** Explicit selection rules — no hidden heuristics. Documented in `docs/architecture/morning-brief-v1.md`. */
export const BRIEF_SELECTION = {
  daily_workspace: {
    minScore: 50,
    maxTotal: 40,
    maxPerSection: 8,
  },
  board_digest: {
    minScore: 65,
    maxTotal: 15,
    maxPerSection: 5,
  },
} as const;

function roundScore(s: number): number {
  const r = Math.round(Number(s));
  if (Number.isNaN(r)) return 0;
  return Math.min(100, Math.max(0, r));
}

/**
 * Time window: intersection of the reporting period `[periodStart, periodEnd]` (UTC day)
 * and `[now - lookbackHours, now]` so backfills stay bounded and the same rules apply to both brief types.
 */
export function effectiveBriefSignalWindow(params: {
  periodStart: Date;
  periodEnd: Date;
  lookbackHours: number;
  now: Date;
}): { windowStart: Date; windowEnd: Date } {
  const { periodStart, periodEnd, lookbackHours, now } = params;
  const lookbackStart = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
  const windowStart = new Date(Math.max(periodStart.getTime(), lookbackStart.getTime()));
  const windowEnd = new Date(Math.min(periodEnd.getTime(), now.getTime()));
  return { windowStart, windowEnd };
}

/**
 * Filter by time window, score floor, sort by score desc, cap total.
 */
export function selectSignalsForBrief(params: {
  signals: LatestSignalDocument[];
  briefType: MorningBriefType;
  periodStart: Date;
  periodEnd: Date;
  lookbackHours: number;
  now: Date;
}): LatestSignalDocument[] {
  const { signals, briefType, periodStart, periodEnd, lookbackHours, now } = params;
  const rules = BRIEF_SELECTION[briefType];
  const { windowStart, windowEnd } = effectiveBriefSignalWindow({
    periodStart,
    periodEnd,
    lookbackHours,
    now,
  });

  if (windowStart.getTime() > windowEnd.getTime()) {
    return [];
  }

  const filtered = signals.filter((s) => {
    const t = s.detectedAt.getTime();
    if (t < windowStart.getTime() || t > windowEnd.getTime()) return false;
    return roundScore(s.score) >= rules.minScore;
  });

  const sorted = [...filtered].sort((a, b) => roundScore(b.score) - roundScore(a.score));
  return sorted.slice(0, rules.maxTotal);
}

export function hasEntityType(s: LatestSignalDocument, entityType: string): boolean {
  return s.entityRefs.some((e) => e.entityType === entityType);
}

export function filterByEntityType(
  signals: LatestSignalDocument[],
  entityType: string,
  max: number,
): LatestSignalDocument[] {
  return signals.filter((s) => hasEntityType(s, entityType)).slice(0, max);
}
