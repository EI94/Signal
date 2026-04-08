import { BigQuery } from '@google-cloud/bigquery';
import type { EntitySignalLinkRow, SignalRow, SignalScoreSnapshot } from '@signal/contracts';

export async function insertSignalAnalyticalRows(params: {
  projectId: string;
  datasetId: string;
  signalsTableId: string;
  signalScoreHistoryTableId: string;
  entitySignalLinksTableId: string;
  signalRows: SignalRow[];
  scoreSnapshots: SignalScoreSnapshot[];
  entityLinks: EntitySignalLinkRow[];
}): Promise<void> {
  const bq = new BigQuery({ projectId: params.projectId });

  if (params.signalRows.length > 0) {
    const t = bq.dataset(params.datasetId).table(params.signalsTableId);
    await t.insert(
      params.signalRows.map((r) => ({
        signal_id: r.signal_id,
        workspace_id: r.workspace_id,
        signal_type: r.signal_type,
        entity_refs_json: r.entity_refs_json != null ? JSON.stringify(r.entity_refs_json) : null,
        title: r.title,
        short_summary: r.short_summary,
        status: r.status,
        novelty: r.novelty,
        occurred_at: r.occurred_at,
        detected_at: r.detected_at,
        latest_composite_score: r.latest_composite_score,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    );
  }

  if (params.scoreSnapshots.length > 0) {
    const t = bq.dataset(params.datasetId).table(params.signalScoreHistoryTableId);
    await t.insert(
      params.scoreSnapshots.map((s) => ({
        signal_id: s.signal_id,
        scored_at: s.scored_at,
        relevance: s.relevance ?? null,
        impact: s.impact ?? null,
        freshness: s.freshness ?? null,
        confidence: s.confidence ?? null,
        source_authority: s.source_authority ?? null,
        composite_score: s.composite_score,
        scoring_version: s.scoring_version,
        workspace_id: s.workspace_id ?? null,
      })),
    );
  }

  if (params.entityLinks.length > 0) {
    const t = bq.dataset(params.datasetId).table(params.entitySignalLinksTableId);
    await t.insert(
      params.entityLinks.map((l) => ({
        entity_type: l.entity_type,
        entity_id: l.entity_id,
        signal_id: l.signal_id,
        signal_type: l.signal_type,
        occurred_at: l.occurred_at ?? null,
        detected_at: l.detected_at,
        composite_score: l.composite_score ?? null,
        status: l.status,
        novelty: l.novelty ?? null,
        workspace_id: l.workspace_id ?? null,
      })),
    );
  }
}
