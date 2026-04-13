import type { LatestSignalDocument } from '@signal/contracts';
import { describe, expect, it } from 'vitest';
import {
  geographicScopeAllowsSignal,
  indexWatchlistAllowsSignal,
  sourceAllowlistAllowsSignal,
} from './user-monitoring-scope';

const base: LatestSignalDocument = {
  signalId: 's',
  signalType: 'project_award',
  title: 'T',
  entityRefs: [],
  score: 70,
  status: 'active',
  occurredAt: new Date(),
  detectedAt: new Date(),
  updatedAt: new Date(),
};

describe('user-monitoring-scope', () => {
  it('allows all signals when coverage is world', () => {
    expect(
      geographicScopeAllowsSignal(base, {
        coverage: 'world',
        macroRegions: ['EUROPE'],
      }),
    ).toBe(true);
  });

  it('allows signal without geo codes (permissive rollout)', () => {
    expect(
      geographicScopeAllowsSignal(
        { ...base, provenance: {} },
        { coverage: 'custom', macroRegions: ['EUROPE'] },
      ),
    ).toBe(true);
  });

  it('denies signal without source-linked geo when strict option is set', () => {
    expect(
      geographicScopeAllowsSignal(
        { ...base, provenance: {} },
        { coverage: 'custom', macroRegions: ['EUROPE'] },
        { denyWhenNoSourceLinkedGeo: true },
      ),
    ).toBe(false);
  });

  it('filters by sourceLinkedGeoCodes when present', () => {
    const us = {
      ...base,
      provenance: { sourceLinkedGeoCodes: ['US'] },
    };
    expect(
      geographicScopeAllowsSignal(us, { coverage: 'custom', macroRegions: ['AMERICAS'] }),
    ).toBe(true);
    expect(
      geographicScopeAllowsSignal(us, { coverage: 'custom', macroRegions: ['EUROPE'] }),
    ).toBe(false);
  });

  it('index watchlist requires intersection with marketIndexTagIds when configured', () => {
    expect(indexWatchlistAllowsSignal(base, undefined)).toBe(true);
    expect(indexWatchlistAllowsSignal(base, [])).toBe(true);
    expect(indexWatchlistAllowsSignal({ ...base, marketIndexTagIds: ['spx'] }, ['spx'])).toBe(true);
    expect(indexWatchlistAllowsSignal({ ...base, marketIndexTagIds: ['spx'] }, ['ndx'])).toBe(false);
    expect(indexWatchlistAllowsSignal(base, ['spx'])).toBe(false);
  });

  it('source allowlist requires matching sourceId when configured', () => {
    const sid = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    expect(sourceAllowlistAllowsSignal(base, undefined)).toBe(true);
    expect(sourceAllowlistAllowsSignal(base, [sid])).toBe(true);
    expect(
      sourceAllowlistAllowsSignal({ ...base, provenance: { sourceId: sid } }, [sid]),
    ).toBe(true);
    expect(
      sourceAllowlistAllowsSignal(
        { ...base, provenance: { sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa7' } },
        [sid],
      ),
    ).toBe(false);
  });
});
