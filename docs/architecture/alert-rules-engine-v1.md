# Alert Rules Engine v1 — WS9.1

## Overview

Deterministic alert rule evaluation engine. Evaluates signals from the `signalsLatest` operational projection against active `alertRules` documents, persists outcomes to BigQuery `alert_evaluations`.

**Semantic model:** `alert_evaluations` is an **append-only analytical history** of evaluation events. Each row is one distinct outcome for one rule against one signal at one evaluation time (or one idempotent retry pass). It is **not** a “latest state” table keyed only by `(workspace, rule, signal)`.

## Supported Rule Conditions

All conditions are **AND-combined**. Missing/undefined fields are treated as "no filter" (always pass).

| Condition   | Type                              | Semantics                                              |
|-------------|-----------------------------------|--------------------------------------------------------|
| signalType  | ExtractedEventFamilyMvp enum      | Exact match on `signal.signalType`                     |
| minScore    | integer 0–100                     | `signal.score >= minScore`                             |
| novelty     | string                            | Exact match on `signal.novelty`                        |
| entityRef   | `{ entityType, entityId }`        | Signal must have a matching entity ref                 |
| keyword     | string (max 200 chars)            | Case-insensitive substring match on title+shortSummary |

## Evaluation Flow

1. Load signal from `workspaces/{wid}/signalsLatest/{signalId}`
2. Load active alert rules from `workspaces/{wid}/alertRules` (`isActive == true`)
3. For each rule:
   - Parse `conditions` Record into typed `AlertCondition`
   - Evaluate conditions against signal (AND, short-circuit on first failure)
   - If matched: check cooldown via BigQuery query
   - Produce outcome: `fired` | `no_match` | `cooldown_suppressed`
4. Persist all evaluation rows to BigQuery `alert_evaluations`
5. Return summary response

## Cooldown & evaluation identity

- **Cooldown (unchanged)**: Queries BigQuery for any row with `outcome = 'fired'` within `cooldownMinutes` for `(workspaceId, alertRuleId, signalId)`. If found, a new `fired` is not written; outcome is `cooldown_suppressed` and a row is still logged with that outcome.
- **evaluation_id** (primary key of the **event**, not “rule × signal” alone):
  - **Default (historical)**: `eval:evt:v1:{evaluatedAtMs}:{workspaceId}:{alertRuleId}:{signalId}:{outcome}` — successive evaluations at different times produce different rows even for the same outcome.
  - **Optional idempotent retry**: request body `evaluationRunId` (alphanumeric, `_`, `-`, max 128). Then `eval:run:v1:{evaluationRunId}:{workspaceId}:{alertRuleId}:{signalId}:{outcome}` — stable across retries of the same logical run.
- **BigQuery streaming dedupe**: Inserts use `insertId === evaluation_id` (see `services/intel` `persist-alert-evaluation`). Duplicate retries with the **same** `evaluation_id` within BigQuery’s streaming deduplication window are de-duplicated by the platform; this complements the historical model (does not replace it).

- A rule with `cooldownMinutes = 0` never suppresses.

## BigQuery Schema

Table: `alert_evaluations` (partitioned by `evaluated_at`, clustered by `workspace_id, alert_rule_id`)

| Column           | Type      |
|------------------|-----------|
| evaluation_id    | STRING    |
| workspace_id     | STRING    |
| alert_rule_id    | STRING    |
| signal_id        | STRING    |
| outcome          | STRING    |
| reason_code      | STRING    |
| evaluated_at     | TIMESTAMP |
| cooldown_applied | BOOL      |
| created_at       | TIMESTAMP |

## Runtime Configuration

| Environment Variable                        | Default              | Purpose                        |
|---------------------------------------------|----------------------|--------------------------------|
| `SIGNAL_ALERT_EVALUATION_ENABLED`           | `false`              | Feature gate for the engine    |
| `SIGNAL_BIGQUERY_ALERT_EVALUATIONS_TABLE`   | `alert_evaluations`  | BigQuery table id              |

## API

### POST `/internal/evaluate-alerts`

Body: `{ signalId: string, workspaceId?: string, evaluationRunId?: string }`

Response: `{ ok: true, result: { signalId, evaluations: [{ alertRuleId, outcome, reasonCode }] } }`

Also available via internal tool `evaluate_alerts` through `POST /internal/tools/execute`.

## Intentionally Deferred

- Automated send on every `fired` outcome (email API: `email-delivery-v1.md`; orchestration later)
- Notification center UI
- Schedule windows / time-of-day constraints
- Complex boolean logic (OR, NOT, nested groups)
- Natural-language or ML-based rule authoring
- Notification document creation (kept out to avoid scope creep; clean follow-up)
- Batch evaluation across all signals (simple to add atop per-signal function)
