import type { SignalRow } from '@signal/contracts';
import { describe, expect, it } from 'vitest';
import { buildLatestSignalDocument } from './project-signal-latest';

describe('buildLatestSignalDocument', () => {
  it('maps analytical row to LatestSignalDocument without raw bodies', () => {
    const now = new Date('2026-04-01T12:00:00Z');
    const row: SignalRow = {
      signal_id: 's'.repeat(32),
      workspace_id: 'ws1',
      signal_type: 'project_award',
      entity_refs_json: [{ entityType: 'company', entityId: 'c1', displayName: 'Acme' }],
      title: 'Project award — Acme',
      short_summary: null,
      status: 'active',
      novelty: 'new',
      occurred_at: now,
      detected_at: now,
      latest_composite_score: 81,
      created_at: now,
      updated_at: now,
    };
    const doc = buildLatestSignalDocument({
      row,
      compositeScore: 81,
      sourceContentId: 'a'.repeat(32),
    });
    expect(doc.signalId).toBe(row.signal_id);
    expect(doc.entityRefs).toHaveLength(1);
    expect(doc.score).toBe(81);
    expect(doc.provenance?.contentRef).toBe('a'.repeat(32));
  });
});
