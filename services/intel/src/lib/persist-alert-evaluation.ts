import { BigQuery } from '@google-cloud/bigquery';
import type { AlertEvaluationRow } from '@signal/contracts';

export async function insertAlertEvaluationRows(params: {
  projectId: string;
  datasetId: string;
  alertEvaluationsTableId: string;
  rows: AlertEvaluationRow[];
}): Promise<void> {
  if (params.rows.length === 0) return;

  const bq = new BigQuery({ projectId: params.projectId });
  const table = bq.dataset(params.datasetId).table(params.alertEvaluationsTableId);

  await table.insert(
    params.rows.map((r) => ({
      insertId: r.evaluation_id,
      json: {
        evaluation_id: r.evaluation_id,
        workspace_id: r.workspace_id,
        alert_rule_id: r.alert_rule_id,
        signal_id: r.signal_id,
        outcome: r.outcome,
        reason_code: r.reason_code,
        evaluated_at: r.evaluated_at,
        cooldown_applied: r.cooldown_applied,
        created_at: r.created_at,
      },
    })),
    { raw: true, createInsertId: false },
  );
}

/**
 * Check whether a specific (alertRuleId, signalId) evaluation already exists
 * with outcome 'fired' within the cooldown window.
 *
 * Returns true if a recent 'fired' evaluation exists (i.e. cooldown should suppress).
 */
export async function checkAlertCooldown(params: {
  projectId: string;
  datasetId: string;
  alertEvaluationsTableId: string;
  workspaceId: string;
  alertRuleId: string;
  signalId: string;
  cooldownMinutes: number;
}): Promise<boolean> {
  if (params.cooldownMinutes <= 0) return false;

  const bq = new BigQuery({ projectId: params.projectId });
  const cutoff = new Date(Date.now() - params.cooldownMinutes * 60_000).toISOString();

  const query = `
    SELECT 1
    FROM \`${params.projectId}.${params.datasetId}.${params.alertEvaluationsTableId}\`
    WHERE workspace_id = @workspaceId
      AND alert_rule_id = @alertRuleId
      AND signal_id = @signalId
      AND outcome = 'fired'
      AND evaluated_at >= @cutoff
    LIMIT 1
  `;

  const [rows] = await bq.query({
    query,
    params: {
      workspaceId: params.workspaceId,
      alertRuleId: params.alertRuleId,
      signalId: params.signalId,
      cutoff,
    },
  });

  return Array.isArray(rows) && rows.length > 0;
}
