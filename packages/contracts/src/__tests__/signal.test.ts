import { describe, expect, it } from 'vitest';
import { PromoteSourceContentSignalsRequestSchema, SignalRowSchema } from '../signal';

describe('PromoteSourceContentSignalsRequestSchema', () => {
  it('accepts a minimal valid body', () => {
    const r = PromoteSourceContentSignalsRequestSchema.safeParse({
      sourceContentId: 'a'.repeat(32),
      observedAt: new Date().toISOString(),
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid sourceContentId length', () => {
    const r = PromoteSourceContentSignalsRequestSchema.safeParse({
      sourceContentId: 'short',
      observedAt: new Date().toISOString(),
    });
    expect(r.success).toBe(false);
  });
});

describe('SignalRowSchema', () => {
  it('accepts a signals table row', () => {
    const now = new Date();
    const r = SignalRowSchema.safeParse({
      signal_id: 's'.repeat(32),
      workspace_id: 'ws1',
      signal_type: 'project_award',
      entity_refs_json: [{ entityType: 'company', entityId: 'c1' }],
      title: 'Test',
      short_summary: null,
      status: 'active',
      novelty: 'new',
      occurred_at: now,
      detected_at: now,
      latest_composite_score: 72,
      created_at: now,
      updated_at: now,
    });
    expect(r.success).toBe(true);
  });
});
