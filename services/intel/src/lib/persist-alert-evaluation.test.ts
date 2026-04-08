import type { AlertEvaluationRow } from '@signal/contracts';
import { describe, expect, it, vi } from 'vitest';
import { insertAlertEvaluationRows } from './persist-alert-evaluation';

const insertFn = vi.fn().mockResolvedValue(undefined);

vi.mock('@google-cloud/bigquery', () => {
  class MockBigQuery {
    dataset() {
      return {
        table: () => ({ insert: insertFn }),
      };
    }
  }
  return { BigQuery: MockBigQuery };
});

function makeRow(over: Partial<AlertEvaluationRow> = {}): AlertEvaluationRow {
  const now = new Date();
  return {
    evaluation_id: 'eval:evt:v1:1:ws:r1:s1:fired',
    workspace_id: 'ws',
    alert_rule_id: 'r1',
    signal_id: 's1',
    outcome: 'fired',
    reason_code: null,
    evaluated_at: now,
    cooldown_applied: false,
    created_at: now,
    ...over,
  };
}

describe('insertAlertEvaluationRows', () => {
  it('does nothing for empty rows', async () => {
    insertFn.mockClear();
    await insertAlertEvaluationRows({
      projectId: 'p',
      datasetId: 'd',
      alertEvaluationsTableId: 't',
      rows: [],
    });
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('calls BigQuery insert for non-empty rows', async () => {
    insertFn.mockClear();
    await insertAlertEvaluationRows({
      projectId: 'p',
      datasetId: 'd',
      alertEvaluationsTableId: 't',
      rows: [makeRow()],
    });
    expect(insertFn).toHaveBeenCalledTimes(1);
    const payload = insertFn.mock.calls[0]?.[0];
    const opts = insertFn.mock.calls[0]?.[1];
    expect(payload).toHaveLength(1);
    const row = payload?.[0] as { insertId: string; json: { evaluation_id: string } };
    expect(row.insertId).toBe('eval:evt:v1:1:ws:r1:s1:fired');
    expect(row.json.evaluation_id).toBe('eval:evt:v1:1:ws:r1:s1:fired');
    expect(opts).toEqual({ raw: true, createInsertId: false });
  });
});
