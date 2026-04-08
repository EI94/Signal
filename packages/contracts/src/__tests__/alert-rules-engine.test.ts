import { describe, expect, it } from 'vitest';
import {
  AlertConditionSchema,
  AlertEvaluationRowSchema,
  buildAlertEvaluationEventId,
  EvaluateAlertsRequestSchema,
} from '../alert-rules-engine';

describe('AlertConditionSchema', () => {
  it('accepts empty (all-pass) condition', () => {
    expect(AlertConditionSchema.parse({})).toEqual({});
  });

  it('accepts full condition set', () => {
    const c = AlertConditionSchema.parse({
      signalType: 'ma_divestment',
      minScore: 70,
      novelty: 'new',
      entityRef: { entityType: 'competitor', entityId: 'acme' },
      keyword: 'merger',
    });
    expect(c.signalType).toBe('ma_divestment');
    expect(c.minScore).toBe(70);
  });

  it('rejects invalid signalType', () => {
    expect(AlertConditionSchema.safeParse({ signalType: 'bad_type' }).success).toBe(false);
  });

  it('rejects minScore out of range', () => {
    expect(AlertConditionSchema.safeParse({ minScore: 101 }).success).toBe(false);
  });
});

describe('AlertEvaluationRowSchema', () => {
  it('parses a valid row', () => {
    const now = new Date().toISOString();
    const row = AlertEvaluationRowSchema.parse({
      evaluation_id: 'eval:evt:v1:1:ws:r1:s1:fired',
      workspace_id: 'ws',
      alert_rule_id: 'r1',
      signal_id: 's1',
      outcome: 'fired',
      reason_code: null,
      evaluated_at: now,
      cooldown_applied: false,
      created_at: now,
    });
    expect(row.outcome).toBe('fired');
  });
});

describe('EvaluateAlertsRequestSchema', () => {
  it('requires signalId', () => {
    expect(EvaluateAlertsRequestSchema.safeParse({}).success).toBe(false);
    expect(EvaluateAlertsRequestSchema.safeParse({ signalId: 'x' }).success).toBe(true);
  });

  it('accepts optional evaluationRunId', () => {
    const p = EvaluateAlertsRequestSchema.safeParse({
      signalId: 's',
      evaluationRunId: 'run-abc_123',
    });
    expect(p.success).toBe(true);
    if (p.success) expect(p.data.evaluationRunId).toBe('run-abc_123');
  });

  it('rejects evaluationRunId with invalid characters', () => {
    expect(
      EvaluateAlertsRequestSchema.safeParse({ signalId: 's', evaluationRunId: 'bad:id' }).success,
    ).toBe(false);
  });
});

describe('buildAlertEvaluationEventId', () => {
  const at = new Date('2026-04-05T12:00:00.000Z');

  it('event mode: includes evaluatedAt ms and outcome so distinct events differ', () => {
    const a = buildAlertEvaluationEventId({
      workspaceId: 'ws-1',
      alertRuleId: 'rule-a',
      signalId: 'sig-5',
      outcome: 'fired',
      evaluatedAt: at,
    });
    expect(a).toBe(`eval:evt:v1:${at.getTime()}:ws-1:rule-a:sig-5:fired`);
    const b = buildAlertEvaluationEventId({
      workspaceId: 'ws-1',
      alertRuleId: 'rule-a',
      signalId: 'sig-5',
      outcome: 'no_match',
      evaluatedAt: at,
    });
    expect(b).toContain(':no_match');
    expect(a).not.toBe(b);
  });

  it('event mode: different wall times produce different ids (historical log)', () => {
    const t1 = new Date('2026-04-05T10:00:00.000Z');
    const t2 = new Date('2026-04-05T10:00:01.000Z');
    const id1 = buildAlertEvaluationEventId({
      workspaceId: 'w',
      alertRuleId: 'r',
      signalId: 's',
      outcome: 'fired',
      evaluatedAt: t1,
    });
    const id2 = buildAlertEvaluationEventId({
      workspaceId: 'w',
      alertRuleId: 'r',
      signalId: 's',
      outcome: 'fired',
      evaluatedAt: t2,
    });
    expect(id1).not.toBe(id2);
  });

  it('run mode: stable id for same run + rule + signal + outcome (retry idempotency)', () => {
    const id1 = buildAlertEvaluationEventId({
      workspaceId: 'w',
      alertRuleId: 'r',
      signalId: 's',
      outcome: 'fired',
      evaluatedAt: at,
      evaluationRunId: 'idem-1',
    });
    const id2 = buildAlertEvaluationEventId({
      workspaceId: 'w',
      alertRuleId: 'r',
      signalId: 's',
      outcome: 'fired',
      evaluatedAt: new Date('2027-01-01T00:00:00.000Z'),
      evaluationRunId: 'idem-1',
    });
    expect(id1).toBe(id2);
    expect(id1).toBe('eval:run:v1:idem-1:w:r:s:fired');
  });
});
