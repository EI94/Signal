import type { IntelRuntimeConfig } from '@signal/config';
import {
  type AlertEvaluationOutcome,
  type AlertEvaluationRow,
  AlertRuleDocumentSchema,
  buildAlertEvaluationEventId,
  type EvaluateAlertsResponse,
  type LatestSignalDocument,
  LatestSignalDocumentSchema,
} from '@signal/contracts';
import type admin from 'firebase-admin';
import { evaluateRuleAgainstSignal, parseRuleConditions } from './evaluate-alert-rule';
import type { checkAlertCooldown, insertAlertEvaluationRows } from './persist-alert-evaluation';

const RULES_FETCH_MAX = 200;

export type EvaluateAlertsDeps = {
  getFirestoreDb: () => admin.firestore.Firestore;
  checkCooldown: typeof checkAlertCooldown;
  insertEvaluations: typeof insertAlertEvaluationRows;
};

type SingleEvaluation = {
  alertRuleId: string;
  outcome: AlertEvaluationOutcome;
  reasonCode: string | null;
};

export async function evaluateAlertsForSignal(
  opts: { workspaceId: string; signalId: string; evaluationRunId?: string | undefined },
  config: IntelRuntimeConfig,
  deps: EvaluateAlertsDeps,
): Promise<EvaluateAlertsResponse> {
  const { workspaceId, signalId, evaluationRunId } = opts;
  const db = deps.getFirestoreDb();
  const now = new Date();

  const signalSnap = await db
    .collection('workspaces')
    .doc(workspaceId)
    .collection('signalsLatest')
    .doc(signalId)
    .get();

  if (!signalSnap.exists) {
    return { signalId, evaluations: [] };
  }

  const signalParsed = LatestSignalDocumentSchema.safeParse(signalSnap.data());
  if (!signalParsed.success) {
    return { signalId, evaluations: [] };
  }
  const signal: LatestSignalDocument = signalParsed.data;

  const rulesSnap = await db
    .collection('workspaces')
    .doc(workspaceId)
    .collection('alertRules')
    .where('isActive', '==', true)
    .limit(RULES_FETCH_MAX)
    .get();

  if (rulesSnap.empty) {
    return { signalId, evaluations: [] };
  }

  const evaluations: SingleEvaluation[] = [];
  const rowsToInsert: AlertEvaluationRow[] = [];

  for (const ruleDoc of rulesSnap.docs) {
    const ruleParsed = AlertRuleDocumentSchema.safeParse(ruleDoc.data());
    if (!ruleParsed.success) continue;

    const rule = ruleParsed.data;
    const ruleId = ruleDoc.id;

    const conditions = parseRuleConditions(rule.conditions);
    if (conditions === null) {
      evaluations.push({
        alertRuleId: ruleId,
        outcome: 'no_match',
        reasonCode: 'invalid_conditions',
      });
      continue;
    }

    const match = evaluateRuleAgainstSignal(conditions, signal);
    if (!match.matched) {
      evaluations.push({ alertRuleId: ruleId, outcome: 'no_match', reasonCode: match.reasonCode });
      rowsToInsert.push(
        buildRow(
          workspaceId,
          ruleId,
          signalId,
          'no_match',
          match.reasonCode,
          false,
          now,
          evaluationRunId,
        ),
      );
      continue;
    }

    const suppressed = await deps.checkCooldown({
      projectId: config.firebaseProjectId,
      datasetId: config.bigQueryDatasetId,
      alertEvaluationsTableId: config.bigQueryAlertEvaluationsTableId,
      workspaceId,
      alertRuleId: ruleId,
      signalId,
      cooldownMinutes: rule.cooldownMinutes,
    });

    if (suppressed) {
      evaluations.push({
        alertRuleId: ruleId,
        outcome: 'cooldown_suppressed',
        reasonCode: 'cooldown_active',
      });
      rowsToInsert.push(
        buildRow(
          workspaceId,
          ruleId,
          signalId,
          'cooldown_suppressed',
          'cooldown_active',
          true,
          now,
          evaluationRunId,
        ),
      );
      continue;
    }

    evaluations.push({ alertRuleId: ruleId, outcome: 'fired', reasonCode: null });
    rowsToInsert.push(
      buildRow(workspaceId, ruleId, signalId, 'fired', null, false, now, evaluationRunId),
    );
  }

  if (rowsToInsert.length > 0) {
    await deps.insertEvaluations({
      projectId: config.firebaseProjectId,
      datasetId: config.bigQueryDatasetId,
      alertEvaluationsTableId: config.bigQueryAlertEvaluationsTableId,
      rows: rowsToInsert,
    });
  }

  return {
    signalId,
    evaluations: evaluations.map((e) => ({
      alertRuleId: e.alertRuleId,
      outcome: e.outcome,
      reasonCode: e.reasonCode,
    })),
  };
}

function buildRow(
  workspaceId: string,
  alertRuleId: string,
  signalId: string,
  outcome: AlertEvaluationOutcome,
  reasonCode: string | null,
  cooldownApplied: boolean,
  now: Date,
  evaluationRunId: string | undefined,
): AlertEvaluationRow {
  return {
    evaluation_id: buildAlertEvaluationEventId({
      workspaceId,
      alertRuleId,
      signalId,
      outcome,
      evaluatedAt: now,
      evaluationRunId,
    }),
    workspace_id: workspaceId,
    alert_rule_id: alertRuleId,
    signal_id: signalId,
    outcome,
    reason_code: reasonCode,
    evaluated_at: now,
    cooldown_applied: cooldownApplied,
    created_at: now,
  };
}
