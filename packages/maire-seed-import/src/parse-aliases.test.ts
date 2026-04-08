import { describe, expect, it } from 'vitest';
import { parseAliasCell } from './parse-aliases';

describe('parseAliasCell', () => {
  it('splits on semicolons', () => {
    expect(parseAliasCell('a; b; c')).toEqual(['a', 'b', 'c']);
  });

  it('returns empty for blank', () => {
    expect(parseAliasCell('')).toEqual([]);
    expect(parseAliasCell(undefined)).toEqual([]);
  });
});
