import { describe, expect, it } from 'vitest';
import { UsageMeteringRowSchema } from '../usage-metering';

describe('usage-metering', () => {
  it('parses a valid row', () => {
    const row = UsageMeteringRowSchema.parse({
      usage_event_id: 'a'.repeat(32),
      event_type: 'ingest.run.complete',
      workspace_id: 'ws-1',
      service_name: 'ingest',
      provider: null,
      outcome: 'ok',
      quantity: 3,
      unit: 'count',
      related_object_id: null,
      metadata_json: { summary: { processed: 3 } },
      occurred_at: new Date('2026-04-05T12:00:00.000Z'),
      created_at: new Date('2026-04-05T12:00:01.000Z'),
    });
    expect(row.quantity).toBe(3);
    expect(row.event_type).toBe('ingest.run.complete');
  });
});
