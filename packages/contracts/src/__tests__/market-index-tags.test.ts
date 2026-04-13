import { describe, expect, it } from 'vitest';
import { AlertingPreferencesSchema } from '../api-preferences';
import { normalizeMarketIndexTagIds } from '../market-index-tags';

describe('normalizeMarketIndexTagIds', () => {
  it('trims, lowercases, and dedupes', () => {
    expect(normalizeMarketIndexTagIds([' SPX ', 'spx', 'EuroStoxx'])).toEqual(['spx', 'eurostoxx']);
  });

  it('drops empties and caps at 32', () => {
    expect(normalizeMarketIndexTagIds(['', '  ', 'a'])).toEqual(['a']);
  });
});

describe('AlertingPreferencesSchema watchedIndexIds', () => {
  it('normalizes via schema transform', () => {
    const a = AlertingPreferencesSchema.parse({
      enabled: true,
      watchedIndexIds: [' SPX ', 'spx', 'EuroStoxx'],
    });
    expect(a.watchedIndexIds).toEqual(['spx', 'eurostoxx']);
  });
});
