import { BigQuery } from '@google-cloud/bigquery';

/**
 * Removes prior analytical rows for these signal ids so promotion is idempotent.
 * Deletes score history only for our deterministic scoring version.
 */
export async function deleteSignalArtifactsForSignalIds(params: {
  projectId: string;
  datasetId: string;
  signalsTableId: string;
  signalScoreHistoryTableId: string;
  entitySignalLinksTableId: string;
  signalIds: readonly string[];
  scoringVersion: string;
}): Promise<void> {
  if (params.signalIds.length === 0) return;

  const bq = new BigQuery({ projectId: params.projectId });
  const ids = [...params.signalIds];

  const links = `\`${params.projectId}.${params.datasetId}.${params.entitySignalLinksTableId}\``;
  const scores = `\`${params.projectId}.${params.datasetId}.${params.signalScoreHistoryTableId}\``;
  const signals = `\`${params.projectId}.${params.datasetId}.${params.signalsTableId}\``;

  const runDml = async (q: string, p: Record<string, unknown>) => {
    try {
      await bq.query({ query: q, params: p });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('streaming buffer')) {
        console.warn(`[deleteSignalArtifacts] streaming buffer DML skip`);
        return;
      }
      throw err;
    }
  };

  await runDml(`DELETE FROM ${links} WHERE signal_id IN UNNEST(@ids)`, { ids });
  await runDml(`DELETE FROM ${scores} WHERE signal_id IN UNNEST(@ids) AND scoring_version = @sv`, {
    ids,
    sv: params.scoringVersion,
  });
  await runDml(`DELETE FROM ${signals} WHERE signal_id IN UNNEST(@ids)`, { ids });
}
