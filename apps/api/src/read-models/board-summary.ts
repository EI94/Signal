import type { BoardSummaryV1Response, LatestSignalDocument } from '@signal/contracts';
import type { GeographyEntityIndex } from './geography-index';
import { mapLatestToSignalSummaryV1 } from './signal-summary-mapper';

const TOP_N = 20;

export function buildBoardSummaryFromWindow(
  workspaceId: string,
  window: LatestSignalDocument[],
  geoIndex?: GeographyEntityIndex | null,
): BoardSummaryV1Response {
  const now = new Date().toISOString();
  const summaries = window
    .map((d) => mapLatestToSignalSummaryV1(d, geoIndex))
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const topSignals = [...summaries]
    .sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0))
    .slice(0, TOP_N);

  const asOf =
    window.length > 0
      ? new Date(Math.max(...window.map((d) => d.detectedAt.getTime()))).toISOString()
      : now;

  return {
    workspaceId,
    generatedAt: now,
    asOf,
    topSignals,
  };
}
