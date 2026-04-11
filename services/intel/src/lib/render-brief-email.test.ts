import type { LatestSignalDocument } from '@signal/contracts';
import { describe, expect, it } from 'vitest';
import { buildBriefEmailHtml, buildBriefEmailSubject } from './render-brief-email';

function makeSignal(overrides: Partial<LatestSignalDocument> = {}): LatestSignalDocument {
  return {
    signalId: 'sig-1',
    signalType: 'project_award',
    title: 'Saipem wins $2B contract',
    shortSummary: 'Major LNG project in Qatar.',
    entityRefs: [
      { entityType: 'competitor', entityId: 'saipem', displayName: 'Saipem' },
      { entityType: 'geography', entityId: 'qa', displayName: 'Qatar' },
    ],
    score: 82,
    status: 'promoted',
    novelty: 'new',
    occurredAt: new Date('2026-04-08T10:00:00Z'),
    detectedAt: new Date('2026-04-08T10:00:00Z'),
    updatedAt: new Date('2026-04-08T10:00:00Z'),
    provenance: {
      sourceLabel: 'Reuters',
      sourceUrl: 'https://reuters.com/article/saipem-lng',
    },
    ...overrides,
  };
}

describe('render brief email', () => {
  it('escapes HTML in signal titles', () => {
    const html = buildBriefEmailHtml({
      title: 'Daily workspace — 2026-04-08',
      dateLabel: 'Tuesday 8 April 2026',
      periodStartIso: '2026-04-08T00:00:00.000Z',
      periodEndIso: '2026-04-08T23:59:59.999Z',
      signals: [makeSignal({ title: '<script>x</script>', shortSummary: null })],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('includes source link', () => {
    const html = buildBriefEmailHtml({
      title: 'Daily workspace — 2026-04-08',
      dateLabel: 'Tuesday 8 April 2026',
      periodStartIso: '2026-04-08T00:00:00.000Z',
      periodEndIso: '2026-04-08T23:59:59.999Z',
      signals: [makeSignal()],
    });
    expect(html).toContain('reuters.com/article/saipem-lng');
    expect(html).toContain('Reuters');
  });

  it('includes Signal product link', () => {
    const html = buildBriefEmailHtml({
      title: 'T',
      dateLabel: 'Tuesday 8 April 2026',
      periodStartIso: '2026-04-08T00:00:00.000Z',
      periodEndIso: '2026-04-08T23:59:59.999Z',
      signals: [makeSignal()],
    });
    expect(html).toContain('signalfromtheworld.com');
    expect(html).toContain('email/signal-mark.svg');
    expect(html).toContain('Read on Signal');
  });

  it('renders empty state gracefully', () => {
    const html = buildBriefEmailHtml({
      title: 'T',
      dateLabel: 'Tuesday 8 April 2026',
      periodStartIso: '2026-04-08T00:00:00.000Z',
      periodEndIso: '2026-04-08T23:59:59.999Z',
      signals: [],
    });
    expect(html).toContain('No signals matched');
  });

  it('builds human-readable subject', () => {
    expect(
      buildBriefEmailSubject({
        title: 'Daily workspace — 2026-04-08',
        dateLabel: 'Tuesday 8 April 2026',
      }),
    ).toContain('daily intelligence brief');
  });
});
