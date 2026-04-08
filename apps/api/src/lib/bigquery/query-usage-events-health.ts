import type { BigQuery } from '@google-cloud/bigquery';

/** Event types read for pipeline lag (must match rows emitted when metering is on). */
export const USAGE_HEALTH_EVENT_TYPES = [
  'ingest.run.complete',
  'intel.promote.complete',
  'intel.brief.generate.complete',
  'intel.alerts.evaluate.complete',
] as const;

export type UsageHealthEventType = (typeof USAGE_HEALTH_EVENT_TYPES)[number];

export type LatestUsageEventTimesResult =
  | { ok: true; lastByType: Partial<Record<UsageHealthEventType, Date>> }
  | { ok: false; error: string };

/**
 * Bounded scan: last ok `occurred_at` per event type for workspace rows + global ingest rows (`workspace_id` null).
 */
export async function queryLatestOkUsageEventTimes(
  bigquery: BigQuery,
  params: {
    readonly projectId: string;
    readonly datasetId: string;
    readonly tableId: string;
    readonly workspaceId: string;
    readonly lookbackHours: number;
  },
): Promise<LatestUsageEventTimesResult> {
  const table = `\`${params.projectId}.${params.datasetId}.${params.tableId}\``;
  const inList = USAGE_HEALTH_EVENT_TYPES.map((t) => `'${t.replace(/'/g, "\\'")}'`).join(', ');
  const query = `
SELECT
  event_type,
  MAX(occurred_at) AS last_occurred_at
FROM ${table}
WHERE occurred_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @lookback_hours HOUR)
  AND outcome = 'ok'
  AND event_type IN (${inList})
  AND (workspace_id = @workspace_id OR workspace_id IS NULL)
GROUP BY event_type
`;

  try {
    const [rows] = await bigquery.query({
      query,
      params: {
        lookback_hours: params.lookbackHours,
        workspace_id: params.workspaceId,
      },
    });

    const lastByType: Partial<Record<UsageHealthEventType, Date>> = {};
    for (const row of rows as Record<string, unknown>[]) {
      const et = row.event_type;
      const raw = row.last_occurred_at;
      if (
        typeof et !== 'string' ||
        !USAGE_HEALTH_EVENT_TYPES.includes(et as UsageHealthEventType)
      ) {
        continue;
      }
      const d = raw instanceof Date ? raw : new Date(String(raw ?? ''));
      if (Number.isNaN(d.getTime())) continue;
      lastByType[et as UsageHealthEventType] = d;
    }
    return { ok: true, lastByType };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
