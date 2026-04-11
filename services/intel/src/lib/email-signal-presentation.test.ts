import { describe, expect, it } from 'vitest';
import {
  formatEntityContextLine,
  pickEmailHeadline,
  pickSecondaryBlurb,
  stripRedundantTypePrefix,
} from './email-signal-presentation';

describe('pickEmailHeadline', () => {
  it('prefers shortSummary when long enough', () => {
    const sum =
      'Saudi Aramco posted strong quarterly results, reinforcing its capacity to fund mega-projects. Analysts expect continued capex in gas and downstream.';
    const h = pickEmailHeadline({
      title: 'Earnings / reporting — Saudi Aramco, Saudi Arabia',
      signalType: 'earnings_reporting_update',
      shortSummary: sum,
    });
    expect(h).toContain('Saudi Aramco posted');
    expect(h).not.toMatch(/^Earnings \/ reporting/);
  });

  it('strips redundant type prefix from title when no rich summary', () => {
    const h = pickEmailHeadline({
      title: 'Earnings / reporting — NextChem, Stamicarbon',
      signalType: 'earnings_reporting_update',
      shortSummary: null,
    });
    expect(h).toBe('NextChem, Stamicarbon');
  });
});

describe('stripRedundantTypePrefix', () => {
  it('returns rest after em dash when first segment matches type', () => {
    expect(
      stripRedundantTypePrefix(
        'Partnership / MoU — Saudi Aramco, Saudi Arabia',
        'partnership_mou',
      ),
    ).toBe('Saudi Aramco, Saudi Arabia');
  });
});

describe('formatEntityContextLine', () => {
  it('joins display names', () => {
    expect(
      formatEntityContextLine([
        { entityType: 'organization', entityId: '1', displayName: 'Saipem' },
        { entityType: 'organization', entityId: '2', displayName: 'Aramco' },
      ]),
    ).toBe('Saipem · Aramco');
  });
});

describe('pickSecondaryBlurb', () => {
  it('returns remainder after headline when summary starts with headline', () => {
    const headline = 'First sentence here.';
    const sum = 'First sentence here. Second sentence with more detail.';
    expect(pickSecondaryBlurb(sum, headline)).toContain('Second sentence');
  });

  it('returns full summary when headline came from title', () => {
    const headline = 'NextChem, Stamicarbon';
    const sum = 'Full analytical paragraph about the earnings call.';
    expect(pickSecondaryBlurb(sum, headline)).toBe(sum);
  });
});
