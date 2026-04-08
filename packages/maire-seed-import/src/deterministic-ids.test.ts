import { describe, expect, it } from 'vitest';
import {
  entitySeedId,
  sourceIdFromCanonicalUrl,
  stringToDeterministicUuid,
} from './deterministic-ids';

describe('deterministic ids', () => {
  it('stringToDeterministicUuid is stable', () => {
    const a = stringToDeterministicUuid('hello');
    const b = stringToDeterministicUuid('hello');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('entitySeedId is stable for same type+name', () => {
    expect(entitySeedId('organization', 'MAIRE')).toBe(entitySeedId('organization', 'MAIRE'));
    expect(entitySeedId('organization', 'MAIRE')).not.toBe(entitySeedId('organization', 'Other'));
  });

  it('sourceIdFromCanonicalUrl lowercases URL for stability', () => {
    expect(sourceIdFromCanonicalUrl('HTTPS://EXAMPLE.COM/A')).toBe(
      sourceIdFromCanonicalUrl('https://example.com/a'),
    );
  });
});
