import { describe, expect, it } from 'vitest';
import { entityPath, entityTypeLabel } from './entity-route';

describe('entityPath', () => {
  it('builds encoded path', () => {
    expect(entityPath('competitor', 'acme-corp')).toBe('/entities/competitor/acme-corp');
  });

  it('encodes special characters', () => {
    expect(entityPath('org', 'a/b')).toBe('/entities/org/a%2Fb');
  });
});

describe('entityTypeLabel', () => {
  it('returns known labels', () => {
    expect(entityTypeLabel('competitor')).toBe('Competitor');
    expect(entityTypeLabel('technology')).toBe('Technology');
  });

  it('falls back to raw type', () => {
    expect(entityTypeLabel('unknown_type')).toBe('unknown_type');
  });
});
