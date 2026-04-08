import { BigQuery } from '@google-cloud/bigquery';
import type { BriefRunRow } from '@signal/contracts';

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function insertBriefRunRow(params: {
  projectId: string;
  datasetId: string;
  tableId: string;
  row: BriefRunRow;
}): Promise<void> {
  const bq = new BigQuery({ projectId: params.projectId });
  const table = bq.dataset(params.datasetId).table(params.tableId);
  const r = params.row;

  await table.insert(
    [
      {
        insertId: r.brief_run_id,
        json: {
          brief_run_id: r.brief_run_id,
          workspace_id: r.workspace_id,
          brief_type: r.brief_type,
          period_start: toYmd(r.period_start),
          period_end: toYmd(r.period_end),
          status: r.status,
          source_signal_ids: r.source_signal_ids,
          generated_at: r.generated_at.toISOString(),
          model_assisted: r.model_assisted,
          created_at: r.created_at.toISOString(),
        },
      },
    ],
    { raw: true, createInsertId: false },
  );
}
