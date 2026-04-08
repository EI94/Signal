import { BigQuery } from '@google-cloud/bigquery';
import type { UsageMeteringRow } from '@signal/contracts';
import { UsageMeteringRowSchema } from '@signal/contracts';

export async function insertUsageMeteringRows(params: {
  readonly projectId: string;
  readonly datasetId: string;
  readonly tableId: string;
  readonly rows: UsageMeteringRow[];
}): Promise<void> {
  if (params.rows.length === 0) return;

  const bq = new BigQuery({ projectId: params.projectId });
  const table = bq.dataset(params.datasetId).table(params.tableId);

  await table.insert(
    params.rows.map((r) => {
      const parsed = UsageMeteringRowSchema.parse(r);
      return {
        insertId: parsed.usage_event_id,
        json: {
          usage_event_id: parsed.usage_event_id,
          event_type: parsed.event_type,
          workspace_id: parsed.workspace_id,
          service_name: parsed.service_name,
          provider: parsed.provider,
          outcome: parsed.outcome,
          quantity: parsed.quantity,
          unit: parsed.unit,
          related_object_id: parsed.related_object_id,
          metadata_json: parsed.metadata_json,
          occurred_at: parsed.occurred_at,
          created_at: parsed.created_at,
        },
      };
    }),
    { raw: true, createInsertId: false },
  );
}
