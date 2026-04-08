import { describe, expect, it } from 'vitest';
import {
  buildOrchestrationIdempotencyKey,
  buildScheduledIngestRunIdempotencyKey,
  buildSourceContentHandoffIdempotencyKey,
} from '../orchestration-idempotency';

describe('orchestration idempotency keys', () => {
  it('buildOrchestrationIdempotencyKey is stable', () => {
    const a = buildOrchestrationIdempotencyKey(['a', 'b']);
    const b = buildOrchestrationIdempotencyKey(['a', 'b']);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{32}$/);
  });

  it('buildSourceContentHandoffIdempotencyKey varies by sourceContentId', () => {
    const x = buildSourceContentHandoffIdempotencyKey('a'.repeat(32));
    const y = buildSourceContentHandoffIdempotencyKey('b'.repeat(32));
    expect(x).not.toBe(y);
  });

  it('buildScheduledIngestRunIdempotencyKey encodes scope', () => {
    const all = buildScheduledIngestRunIdempotencyKey({
      scope: 'all',
      windowStartIso: '2026-04-04T00:00:00.000Z',
    });
    const single = buildScheduledIngestRunIdempotencyKey({
      scope: 'single',
      sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      windowStartIso: '2026-04-04T00:00:00.000Z',
    });
    expect(all).not.toBe(single);
  });
});
