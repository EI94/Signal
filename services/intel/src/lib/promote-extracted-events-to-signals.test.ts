import type { ExtractedEventRow } from '@signal/contracts';
import { deriveSignalId } from '@signal/contracts';
import { describe, expect, it } from 'vitest';
import { buildPromotionBundlesFromExtractedEvents } from './promote-extracted-events-to-signals';

const observedAt = new Date('2026-04-01T10:00:00Z');

function row(
  partial: Partial<ExtractedEventRow> & Pick<ExtractedEventRow, 'event_family'>,
): ExtractedEventRow {
  const base: ExtractedEventRow = {
    extracted_event_id: 'e'.repeat(32),
    event_family: partial.event_family,
    event_time: new Date('2026-03-30T08:00:00Z'),
    event_time_precision: 'day',
    confidence: 72,
    ambiguity_notes: null,
    evidence_source_content_ids: ['a'.repeat(32)],
    extracted_facts_json: { extractor: 'deterministic_keyword_v1', foo: 'bar' },
    linked_entity_refs_json: [{ entityType: 'company', entityId: 'c1', displayName: 'Acme' }],
    created_at: new Date('2026-03-30T09:00:00Z'),
  };
  return { ...base, ...partial };
}

describe('buildPromotionBundlesFromExtractedEvents', () => {
  it('skips events with no linked entities', () => {
    const bundles = buildPromotionBundlesFromExtractedEvents({
      events: [
        row({
          event_family: 'project_award',
          linked_entity_refs_json: null,
        }),
      ],
      workspaceId: 'ws1',
      observedAt,
      sourceAuthority: 60,
      sourceContentId: 'a'.repeat(32),
    });
    expect(bundles).toHaveLength(0);
  });

  it('produces one bundle per qualifying event with stable signal_id', () => {
    const ev = row({ event_family: 'project_award' });
    const bundles = buildPromotionBundlesFromExtractedEvents({
      events: [ev],
      workspaceId: 'ws1',
      observedAt,
      sourceAuthority: 60,
      sourceContentId: 'a'.repeat(32),
    });
    expect(bundles).toHaveLength(1);
    const sid = deriveSignalId({
      extractedEventId: ev.extracted_event_id,
      signalType: 'project_award',
    });
    expect(bundles[0]?.signalRow.signal_id).toBe(sid);
    expect(bundles[0]?.signalRow.signal_type).toBe('project_award');
    expect(bundles[0]?.entityLinks).toHaveLength(1);
    expect(bundles[0]?.entityLinks[0]?.entity_id).toBe('c1');
  });
});
