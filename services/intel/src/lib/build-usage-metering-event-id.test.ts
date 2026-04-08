import { describe, expect, it } from 'vitest';
import { buildUsageMeteringEventId } from './build-usage-metering-event-id';

describe('buildUsageMeteringEventId', () => {
  it('is deterministic for the same inputs', () => {
    const a = buildUsageMeteringEventId({
      serviceName: 'intel',
      eventType: 'intel.tool.execute',
      occurredAtIso: '2026-04-05T12:00:00.000Z',
      dedupeKey: 'k1',
    });
    const b = buildUsageMeteringEventId({
      serviceName: 'intel',
      eventType: 'intel.tool.execute',
      occurredAtIso: '2026-04-05T12:00:00.000Z',
      dedupeKey: 'k1',
    });
    expect(a).toBe(b);
    expect(a.length).toBe(32);
  });

  it('changes when dedupeKey changes', () => {
    const a = buildUsageMeteringEventId({
      serviceName: 'ingest',
      eventType: 'ingest.run.complete',
      occurredAtIso: '2026-04-05T12:00:00.000Z',
      dedupeKey: 'run:1',
    });
    const b = buildUsageMeteringEventId({
      serviceName: 'ingest',
      eventType: 'ingest.run.complete',
      occurredAtIso: '2026-04-05T12:00:00.000Z',
      dedupeKey: 'run:2',
    });
    expect(a).not.toBe(b);
  });
});
