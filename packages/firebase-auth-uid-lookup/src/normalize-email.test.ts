import { describe, expect, it } from 'vitest';
import { normalizeAuthLookupEmail } from './normalize-email';

describe('normalizeAuthLookupEmail', () => {
  it('trims whitespace', () => {
    expect(normalizeAuthLookupEmail('  a@b.co  ')).toBe('a@b.co');
  });
});
