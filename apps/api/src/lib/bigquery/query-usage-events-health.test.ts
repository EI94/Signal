import { describe, expect, it, vi } from 'vitest';
import { queryLatestOkUsageEventTimes } from './query-usage-events-health';

describe('queryLatestOkUsageEventTimes', () => {
  it('maps rows into lastByType', async () => {
    const bigquery = {
      query: vi.fn().mockResolvedValue([
        [
          {
            event_type: 'ingest.run.complete',
            last_occurred_at: new Date('2026-04-05T10:00:00.000Z'),
          },
        ],
      ]),
    };

    const r = await queryLatestOkUsageEventTimes(bigquery as never, {
      projectId: 'p',
      datasetId: 'd',
      tableId: 'usage_events',
      workspaceId: 'ws1',
      lookbackHours: 168,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lastByType['ingest.run.complete']?.toISOString()).toBe('2026-04-05T10:00:00.000Z');
    }
    expect(bigquery.query).toHaveBeenCalledTimes(1);
    const first = bigquery.query.mock.calls[0]?.[0] as { query: string } | undefined;
    expect(first?.query).toContain('ingest.run.complete');
  });

  it('returns ok:false on query errors', async () => {
    const bigquery = {
      query: vi.fn().mockRejectedValue(new Error('bq down')),
    };
    const r = await queryLatestOkUsageEventTimes(bigquery as never, {
      projectId: 'p',
      datasetId: 'd',
      tableId: 'usage_events',
      workspaceId: 'ws1',
      lookbackHours: 24,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('bq down');
  });
});
