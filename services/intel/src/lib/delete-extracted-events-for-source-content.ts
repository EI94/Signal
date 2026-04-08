import { BigQuery } from '@google-cloud/bigquery';

/** Idempotent re-runs: remove prior rows that cite this SourceContent as evidence. */
export async function deleteExtractedEventsForSourceContentId(params: {
  projectId: string;
  datasetId: string;
  tableId: string;
  sourceContentId: string;
}): Promise<void> {
  const bq = new BigQuery({ projectId: params.projectId });
  const table = `\`${params.projectId}.${params.datasetId}.${params.tableId}\``;
  const query = `
    DELETE FROM ${table}
    WHERE @scid IN UNNEST(evidence_source_content_ids)
  `;
  try {
    await bq.query({
      query,
      params: { scid: params.sourceContentId },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('streaming buffer')) {
      console.warn(
        `[deleteExtractedEvents] streaming buffer DML skip for ${params.sourceContentId}`,
      );
      return;
    }
    throw err;
  }
}
