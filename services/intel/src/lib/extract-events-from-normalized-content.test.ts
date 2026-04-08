import { deriveExtractedEventId } from '@signal/contracts';
import { describe, expect, it } from 'vitest';
import { extractDeterministicEventsFromNormalizedContent } from './extract-events-from-normalized-content';

describe('extractDeterministicEventsFromNormalizedContent', () => {
  it('returns project_award when contract language is present', () => {
    const rows = extractDeterministicEventsFromNormalizedContent({
      sourceContentId: 'ab'.repeat(16),
      normalizedText: 'We are pleased to announce the contract awarded for the solar park.',
      observedAt: new Date('2026-04-04T12:00:00.000Z'),
      publishedAt: null,
      linkedEntityRefs: [],
    });
    const award = rows.find((r) => r.event_family === 'project_award');
    expect(award).toBeDefined();
    expect(award?.evidence_source_content_ids).toEqual(['ab'.repeat(16)]);
  });

  it('returns multiple families when multiple keywords match', () => {
    const rows = extractDeterministicEventsFromNormalizedContent({
      sourceContentId: 'ab'.repeat(16),
      normalizedText:
        'The company reported quarterly results and announced a strategic partnership agreement.',
      observedAt: new Date('2026-04-04T12:00:00.000Z'),
      publishedAt: null,
      linkedEntityRefs: [],
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const families = new Set(rows.map((r) => r.event_family));
    expect(families.has('earnings_reporting_update')).toBe(true);
    expect(families.has('partnership_mou')).toBe(true);
  });

  it('returns empty when nothing matches', () => {
    const rows = extractDeterministicEventsFromNormalizedContent({
      sourceContentId: 'ab'.repeat(16),
      normalizedText: 'lorem ipsum dolor sit amet',
      observedAt: new Date('2026-04-04T12:00:00.000Z'),
      publishedAt: null,
      linkedEntityRefs: [],
    });
    expect(rows).toHaveLength(0);
  });

  it('uses stable ids for same text', () => {
    const input = {
      sourceContentId: 'ef'.repeat(16) as string,
      normalizedText: 'Joint venture with partner to acquire assets.',
      observedAt: new Date('2026-04-04T12:00:00.000Z'),
      publishedAt: null,
      linkedEntityRefs: [] as const,
    };
    const a = extractDeterministicEventsFromNormalizedContent(input);
    const b = extractDeterministicEventsFromNormalizedContent(input);
    expect(a.map((r) => r.extracted_event_id)).toEqual(b.map((r) => r.extracted_event_id));
  });

  it('maps linkedEntityRefs into linked_entity_refs_json', () => {
    const rows = extractDeterministicEventsFromNormalizedContent({
      sourceContentId: 'ab'.repeat(16),
      normalizedText: 'memorandum of understanding signed today.',
      observedAt: new Date('2026-04-04T12:00:00.000Z'),
      publishedAt: null,
      linkedEntityRefs: [{ entityType: 'company', entityId: 'c1' }],
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.linked_entity_refs_json?.[0]?.entityId).toBe('c1');
  });
});

describe('deriveExtractedEventId integration', () => {
  it('matches row id format', () => {
    const id = deriveExtractedEventId({
      sourceContentId: 'aa'.repeat(16),
      eventFamily: 'technology_milestone',
      matchSignature: 'test-sig',
    });
    expect(id.length).toBe(32);
  });
});
