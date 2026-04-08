import { describe, expect, it } from 'vitest';
import {
  buildSignalsPagePath,
  parseSignalsFeedSearchParams,
  parseSignalsFeedSearchParamsFromRecord,
  serializeSignalsFeedFiltersToQueryString,
} from '../signals-url-state';

describe('signals-url-state', () => {
  it('parses signalType, sort, minScore from URLSearchParams', () => {
    const u = new URLSearchParams();
    u.set('signalType', 'project_award');
    u.set('sort', 'score_desc');
    u.set('minScore', '70');
    expect(parseSignalsFeedSearchParams(u)).toEqual({
      signalType: 'project_award',
      sort: 'score_desc',
      minScore: 70,
    });
  });

  it('ignores invalid sort', () => {
    const u = new URLSearchParams();
    u.set('sort', 'invalid');
    expect(parseSignalsFeedSearchParams(u).sort).toBeUndefined();
  });

  it('does not set minScore for 0 or negative', () => {
    expect(parseSignalsFeedSearchParams(new URLSearchParams('minScore=0'))).toEqual({});
    expect(parseSignalsFeedSearchParams(new URLSearchParams('minScore=-1'))).toEqual({});
  });

  it('serializes omitting defaults and minScore 0', () => {
    expect(serializeSignalsFeedFiltersToQueryString({})).toBe('');
    expect(serializeSignalsFeedFiltersToQueryString({ minScore: 0 })).toBe('');
    expect(
      serializeSignalsFeedFiltersToQueryString({ signalType: 'ma_divestment', minScore: 50 }),
    ).toBe('signalType=ma_divestment&minScore=50');
  });

  it('buildSignalsPagePath returns bare path when no filters', () => {
    expect(buildSignalsPagePath({})).toBe('/signals');
  });

  it('parseSignalsFeedSearchParamsFromRecord handles string arrays', () => {
    expect(
      parseSignalsFeedSearchParamsFromRecord({
        signalType: ['project_award'],
        sort: 'detected_at_desc',
      }),
    ).toEqual({ signalType: 'project_award', sort: 'detected_at_desc' });
  });

  it('round-trip preserves supported filters', () => {
    const f = {
      signalType: 'technology_milestone',
      sort: 'occurred_at_desc' as const,
      minScore: 90,
    };
    const qs = serializeSignalsFeedFiltersToQueryString(f);
    const back = parseSignalsFeedSearchParams(new URLSearchParams(qs));
    expect(back).toEqual(f);
  });
});
