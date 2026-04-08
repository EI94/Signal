import { describe, expect, it } from 'vitest';
import { extractBearerToken } from './bearer-token';

describe('extractBearerToken', () => {
  it('returns null for undefined or empty', () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('')).toBeNull();
  });

  it('returns null when not Bearer', () => {
    expect(extractBearerToken('Basic xyz')).toBeNull();
  });

  it('extracts token case-insensitively for scheme', () => {
    expect(extractBearerToken('bearer mytoken')).toBe('mytoken');
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('returns null when Bearer has no token', () => {
    expect(extractBearerToken('Bearer ')).toBeNull();
    expect(extractBearerToken('Bearer')).toBeNull();
  });
});
