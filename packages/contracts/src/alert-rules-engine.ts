import { z } from 'zod';
import { ExtractedEventFamilyMvpSchema } from './extracted-event';
import { EntityRefSchema } from './firestore-operational';

/**
 * WS9.1 — Executable alert rule conditions and evaluation schema.
 *
 * Condition model: deliberately small. All conditions are AND-combined.
 * Missing/undefined fields are treated as "no filter" (always pass).
 */
export const AlertConditionSchema = z.object({
  signalType: ExtractedEventFamilyMvpSchema.optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  novelty: z.string().min(1).optional(),
  entityRef: EntityRefSchema.pick({ entityType: true, entityId: true }).optional(),
  keyword: z.string().min(1).max(200).optional(),
  /** Any-match: fires if at least one ref matches a signal entityRef. */
  entityRefs: z.array(EntityRefSchema.pick({ entityType: true, entityId: true })).optional(),
  /** Any-match: fires if any signal geography entityRef matches one of these entity IDs. */
  countryEntityIds: z.array(z.string().min(1)).optional(),
});

export type AlertCondition = z.infer<typeof AlertConditionSchema>;

export const AlertEvaluationOutcomeSchema = z.enum(['fired', 'no_match', 'cooldown_suppressed']);

export type AlertEvaluationOutcome = z.infer<typeof AlertEvaluationOutcomeSchema>;

/**
 * BigQuery `alert_evaluations` row shape (snake_case, aligned with DDL).
 */
export const AlertEvaluationRowSchema = z.object({
  evaluation_id: z.string().min(1),
  workspace_id: z.string().min(1),
  alert_rule_id: z.string().min(1),
  signal_id: z.string().min(1),
  outcome: AlertEvaluationOutcomeSchema,
  reason_code: z.string().nullable(),
  evaluated_at: z.coerce.date(),
  cooldown_applied: z.boolean(),
  created_at: z.coerce.date(),
});

export type AlertEvaluationRow = z.infer<typeof AlertEvaluationRowSchema>;

/** Optional client idempotency key for a single evaluation pass (retries reuse the same value). */
export const EvaluationRunIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/, 'evaluationRunId must be alphanumeric, underscore, or hyphen');

export type EvaluationRunId = z.infer<typeof EvaluationRunIdSchema>;

/**
 * Request body for `POST /internal/evaluate-alerts`.
 */
export const EvaluateAlertsRequestSchema = z.object({
  workspaceId: z.string().min(1).optional(),
  signalId: z.string().min(1),
  /** When set, `evaluation_id` is stable for this run so retries dedupe via BigQuery streaming `insertId`. */
  evaluationRunId: EvaluationRunIdSchema.optional(),
});

export type EvaluateAlertsRequest = z.infer<typeof EvaluateAlertsRequestSchema>;

/**
 * Response shape for `POST /internal/evaluate-alerts`.
 */
export const EvaluateAlertsResponseSchema = z.object({
  signalId: z.string().min(1),
  evaluations: z.array(
    z.object({
      alertRuleId: z.string().min(1),
      outcome: AlertEvaluationOutcomeSchema,
      reasonCode: z.string().nullable(),
    }),
  ),
});

export type EvaluateAlertsResponse = z.infer<typeof EvaluateAlertsResponseSchema>;

export type BuildAlertEvaluationEventIdParams = {
  workspaceId: string;
  alertRuleId: string;
  signalId: string;
  outcome: AlertEvaluationOutcome;
  /** Wall time for this evaluation pass (typically one `Date` per HTTP/tool invocation). */
  evaluatedAt: Date;
  /**
   * When set, builds a stable id for this logical run (same value on client retry → same row id + BigQuery insertId dedupe).
   * When omitted, `evaluatedAt` distinguishes successive evaluations over time (historical log).
   */
  evaluationRunId?: string | undefined;
};

/**
 * Primary key for one **evaluation event** in the analytical `alert_evaluations` log.
 *
 * - **Historical default** (`evaluationRunId` absent): `eval:evt:v1:{evaluatedAtMs}:{workspaceId}:{alertRuleId}:{signalId}:{outcome}`
 *   — distinct runs at different times produce distinct rows for the same rule/signal/outcome.
 * - **Idempotent retry** (`evaluationRunId` set): `eval:run:v1:{evaluationRunId}:{workspaceId}:{alertRuleId}:{signalId}:{outcome}`
 *   — retries with the same run id + BigQuery `insertId === evaluation_id` suppress duplicate streaming inserts.
 */
export function buildAlertEvaluationEventId(params: BuildAlertEvaluationEventIdParams): string {
  const { workspaceId, alertRuleId, signalId, outcome, evaluatedAt, evaluationRunId } = params;
  if (evaluationRunId !== undefined && evaluationRunId.length > 0) {
    return `eval:run:v1:${evaluationRunId}:${workspaceId}:${alertRuleId}:${signalId}:${outcome}`;
  }
  return `eval:evt:v1:${evaluatedAt.getTime()}:${workspaceId}:${alertRuleId}:${signalId}:${outcome}`;
}
