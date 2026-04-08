import { BigQuery } from '@google-cloud/bigquery';
import type { ExtractedEventRow } from '@signal/contracts';

export async function insertExtractedEventRows(params: {
  projectId: string;
  datasetId: string;
  tableId: string;
  rows: ExtractedEventRow[];
}): Promise<void> {
  if (params.rows.length === 0) return;
  const bq = new BigQuery({ projectId: params.projectId });
  const table = bq.dataset(params.datasetId).table(params.tableId);
  const payload = params.rows.map((r) => ({
    extracted_event_id: r.extracted_event_id,
    event_family: r.event_family,
    event_time: r.event_time,
    event_time_precision: r.event_time_precision,
    confidence: r.confidence,
    ambiguity_notes: r.ambiguity_notes,
    evidence_source_content_ids: r.evidence_source_content_ids,
    extracted_facts_json:
      r.extracted_facts_json != null ? JSON.stringify(r.extracted_facts_json) : null,
    linked_entity_refs_json:
      r.linked_entity_refs_json != null ? JSON.stringify(r.linked_entity_refs_json) : null,
    created_at: r.created_at,
  }));
  await table.insert(payload);
}
