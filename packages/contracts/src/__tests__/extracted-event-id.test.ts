import { describe, expect, it } from 'vitest';
import { buildMatchSignature, deriveExtractedEventId } from '../extracted-event-id';

describe('deriveExtractedEventId', () => {
  it('is stable for same inputs', () => {
    const a = deriveExtractedEventId({
      sourceContentId: 'ab'.repeat(16),
      eventFamily: 'project_award',
      matchSignature: 'sig1',
    });
    const b = deriveExtractedEventId({
      sourceContentId: 'ab'.repeat(16),
      eventFamily: 'project_award',
      matchSignature: 'sig1',
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{32}$/);
  });

  it('differs when family changes', () => {
    const base = { sourceContentId: 'cd'.repeat(16), matchSignature: 'x' };
    expect(
      deriveExtractedEventId({ ...base, eventFamily: 'project_award' }) !==
        deriveExtractedEventId({ ...base, eventFamily: 'ma_divestment' }),
    ).toBe(true);
  });
});

describe('buildMatchSignature', () => {
  it('is stable for same inputs', () => {
    const a = buildMatchSignature({
      matchedTerms: ['a', 'b'],
      evidenceSnippet: 'hello',
      ordinal: 0,
    });
    const b = buildMatchSignature({
      matchedTerms: ['b', 'a'],
      evidenceSnippet: 'hello',
      ordinal: 0,
    });
    expect(a).toBe(b);
  });
});
