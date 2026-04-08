import { describe, expect, it } from 'vitest';
import { EntitySignalLinkRowSchema, SignalScoreSnapshotSchema } from '../bigquery-analytical';

describe('SignalScoreSnapshotSchema', () => {
  it('accepts a scoring history row', () => {
    const r = SignalScoreSnapshotSchema.safeParse({
      signal_id: 's1',
      scored_at: new Date().toISOString(),
      relevance: 80,
      composite_score: 75,
      scoring_version: 'scoring-v1',
    });
    expect(r.success).toBe(true);
  });
});

describe('EntitySignalLinkRowSchema', () => {
  it('accepts bridge row', () => {
    const r = EntitySignalLinkRowSchema.safeParse({
      entity_type: 'company',
      entity_id: 'e1',
      signal_id: 's1',
      signal_type: 'ma_divestment',
      detected_at: new Date().toISOString(),
      status: 'active',
    });
    expect(r.success).toBe(true);
  });
});
