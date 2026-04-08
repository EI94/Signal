import { describe, expect, it, vi } from 'vitest';
import { insertUsageMeteringRows } from './insert-usage-metering-rows';

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

describe('insertUsageMeteringRows', () => {
  it('inserts validated rows with insertId', async () => {
    insertFn.mockClear();
    const occurredAt = new Date('2026-04-05T12:00:00.000Z');
    const createdAt = new Date('2026-04-05T12:00:01.000Z');
    await insertUsageMeteringRows({
      projectId: 'p',
      datasetId: 'd',
      tableId: 'usage_events',
      rows: [
        {
          usage_event_id: '0'.repeat(32),
          event_type: 'intel.email.send',
          workspace_id: 'ws',
          service_name: 'intel',
          provider: 'resend',
          outcome: 'ok',
          quantity: 1,
          unit: 'count',
          related_object_id: 'del-1',
          metadata_json: { kind: 'alert' },
          occurred_at: occurredAt,
          created_at: createdAt,
        },
      ],
    });
    expect(insertFn).toHaveBeenCalledTimes(1);
    const payload = insertFn.mock.calls[0]?.[0] as { insertId: string }[] | undefined;
    expect(payload?.[0]?.insertId).toBe('0'.repeat(32));
  });

  it('no-ops on empty rows', async () => {
    insertFn.mockClear();
    await insertUsageMeteringRows({
      projectId: 'p',
      datasetId: 'd',
      tableId: 'usage_events',
      rows: [],
    });
    expect(insertFn).not.toHaveBeenCalled();
  });
});
