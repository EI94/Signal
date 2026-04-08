import { describe, expect, it } from 'vitest';
import { decideFetchDelta } from './delta-decision';

describe('decideFetchDelta', () => {
  it('returns first_seen when no prior hash', () => {
    expect(decideFetchDelta({ newHashHex: 'abc', previousHash: undefined })).toBe('first_seen');
  });

  it('returns unchanged when equal', () => {
    expect(decideFetchDelta({ newHashHex: 'abc', previousHash: 'abc' })).toBe('unchanged');
  });

  it('returns changed when different', () => {
    expect(decideFetchDelta({ newHashHex: 'abc', previousHash: 'def' })).toBe('changed');
  });
});
