import {
  deriveSignalId,
  type EntitySignalLinkRow,
  type ExtractedEventFamilyMvp,
  type ExtractedEventRow,
  SIGNAL_PROMOTION_SCORING_VERSION,
  type SignalRow,
  type SignalScoreSnapshot,
} from '@signal/contracts';
import { disclosedValueEurMillionFromFacts, scoreSignalDeterministic } from './score-signal';

const FAMILY_TITLE: Record<ExtractedEventFamilyMvp, string> = {
  project_award: 'Project award',
  partnership_mou: 'Partnership / MoU',
  earnings_reporting_update: 'Earnings / reporting',
  ma_divestment: 'M&A / divestment',
  technology_milestone: 'Technology milestone',
};

function buildTitle(
  family: ExtractedEventFamilyMvp,
  entities: NonNullable<ExtractedEventRow['linked_entity_refs_json']>,
) {
  const base = FAMILY_TITLE[family];
  const names = entities
    .map((e) => e.displayName?.trim())
    .filter((x): x is string => Boolean(x && x.length > 0));
  if (names.length === 0) return base;
  const suffix = names.slice(0, 3).join(', ');
  const t = `${base} — ${suffix}`;
  return t.length > 512 ? t.slice(0, 509).concat('...') : t;
}

const SUPPRESSED_SUMMARIES = [
  'single keyword match; verify context.',
  'multiple keyword hits; heuristic match only.',
];

function shortSummaryFromEvent(ambiguity: string | null): string | null {
  if (!ambiguity) return null;
  if (SUPPRESSED_SUMMARIES.includes(ambiguity.toLowerCase().trim())) return null;
  return ambiguity.length > 240 ? ambiguity.slice(0, 237).concat('...') : ambiguity;
}

export type PromotedSignalBundle = {
  signalRow: SignalRow;
  scoreSnapshot: SignalScoreSnapshot;
  entityLinks: EntitySignalLinkRow[];
  compositeScore: number;
};

/**
 * One ExtractedEvent with ≥1 linked entity → one Signal (MVP). Skips rows without entities.
 */
export function buildPromotionBundlesFromExtractedEvents(params: {
  events: ExtractedEventRow[];
  workspaceId: string;
  observedAt: Date;
  sourceAuthority: number;
  sourceContentId: string;
}): PromotedSignalBundle[] {
  const bundles: PromotedSignalBundle[] = [];

  for (const ev of params.events) {
    const entities = ev.linked_entity_refs_json;
    if (!entities || entities.length === 0) continue;

    const signalType = ev.event_family;
    const signal_id = deriveSignalId({ extractedEventId: ev.extracted_event_id, signalType });

    const factKeys = ev.extracted_facts_json ? Object.keys(ev.extracted_facts_json).length : 0;
    const { dimensions, composite } = scoreSignalDeterministic({
      eventFamily: signalType,
      extractionConfidence: ev.confidence,
      eventTime: ev.event_time,
      observedAt: params.observedAt,
      eventTimePrecision: ev.event_time_precision,
      disclosedValueEurMillion: disclosedValueEurMillionFromFacts(ev.extracted_facts_json),
      sourceAuthority: params.sourceAuthority,
      extractedFactKeyCount: factKeys,
    });

    const signalRow: SignalRow = {
      signal_id,
      workspace_id: params.workspaceId,
      signal_type: signalType,
      entity_refs_json: [...entities],
      title: buildTitle(signalType, entities),
      short_summary: shortSummaryFromEvent(ev.ambiguity_notes),
      status: 'active',
      novelty: 'new',
      occurred_at: ev.event_time,
      detected_at: params.observedAt,
      latest_composite_score: composite,
      created_at: ev.created_at,
      updated_at: params.observedAt,
    };

    const scoreSnapshot: SignalScoreSnapshot = {
      signal_id,
      scored_at: params.observedAt,
      relevance: dimensions.relevance,
      impact: dimensions.impact,
      freshness: dimensions.freshness,
      confidence: dimensions.confidence,
      source_authority: dimensions.sourceAuthority,
      composite_score: composite,
      scoring_version: SIGNAL_PROMOTION_SCORING_VERSION,
      workspace_id: params.workspaceId,
    };

    const entityLinks: EntitySignalLinkRow[] = entities.map((en) => ({
      entity_type: en.entityType,
      entity_id: en.entityId,
      signal_id,
      signal_type: signalType,
      occurred_at: ev.event_time,
      detected_at: params.observedAt,
      composite_score: composite,
      status: 'active',
      novelty: 'new',
      workspace_id: params.workspaceId,
    }));

    bundles.push({ signalRow, scoreSnapshot, entityLinks, compositeScore: composite });
  }

  return bundles;
}
