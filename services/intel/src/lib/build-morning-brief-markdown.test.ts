import type { LatestSignalDocument } from '@signal/contracts';
import { describe, expect, it } from 'vitest';
import { buildMorningBriefMarkdown } from './build-morning-brief-markdown';

const baseSig = (
  partial: Partial<LatestSignalDocument> & Pick<LatestSignalDocument, 'signalId'>,
): LatestSignalDocument => {
  const d = new Date('2026-04-05T12:00:00.000Z');
  return {
    signalType: 'project_award',
    title: 'T',
    entityRefs: [],
    score: 80,
    status: 'active',
    occurredAt: d,
    detectedAt: d,
    updatedAt: d,
    ...partial,
  };
};

describe('buildMorningBriefMarkdown', () => {
  it('includes executive block when provided', () => {
    const md = buildMorningBriefMarkdown({
      briefType: 'daily_workspace',
      workspaceId: 'ws',
      periodLabel: '2026-04-05',
      periodStartIso: '2026-04-05T00:00:00.000Z',
      periodEndIso: '2026-04-05T23:59:59.999Z',
      selected: [],
      executiveSummaryBlock: 'One line summary.',
    });
    expect(md).toContain('## Executive summary');
    expect(md).toContain('One line summary.');
  });

  it('groups entity-linked rows under competitor / client / geography headings', () => {
    const selected = [
      baseSig({
        signalId: 's1',
        title: 'Comp move',
        score: 90,
        entityRefs: [{ entityType: 'competitor', entityId: 'c1' }],
      }),
      baseSig({
        signalId: 's2',
        title: 'Client win',
        score: 85,
        entityRefs: [{ entityType: 'client', entityId: 'cl1' }],
      }),
      baseSig({
        signalId: 's3',
        title: 'EU region',
        score: 82,
        entityRefs: [{ entityType: 'geography', entityId: 'eu' }],
      }),
    ];
    const md = buildMorningBriefMarkdown({
      briefType: 'board_digest',
      workspaceId: 'ws',
      periodLabel: '2026-04-05',
      periodStartIso: '2026-04-05T00:00:00.000Z',
      periodEndIso: '2026-04-05T23:59:59.999Z',
      selected,
    });
    expect(md).toContain('## Competitor-linked');
    expect(md).toContain('Comp move');
    expect(md).toContain('## Client-linked');
    expect(md).toContain('Client win');
    expect(md).toContain('## Markets & regions');
    expect(md).toContain('EU region');
  });
});
