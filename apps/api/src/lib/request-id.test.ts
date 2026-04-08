import { describe, expect, it } from 'vitest';
import { getOrCreateRequestId, isValidInboundRequestId } from './request-id';

describe('isValidInboundRequestId', () => {
  it('accepts UUID-like strings in range', () => {
    expect(isValidInboundRequestId('abcd1234-abcd-4bcd-abcd-1234567890ab')).toBe(true);
  });

  it('rejects too short or too long', () => {
    expect(isValidInboundRequestId('short')).toBe(false);
    expect(isValidInboundRequestId('a'.repeat(129))).toBe(false);
  });

  it('rejects injection-ish characters', () => {
    expect(isValidInboundRequestId('abc\n')).toBe(false);
    expect(isValidInboundRequestId('a;b')).toBe(false);
  });
});

describe('getOrCreateRequestId', () => {
  it('preserves valid inbound id', () => {
    const id = 'abcd1234-abcd-4bcd-abcd-1234567890ab';
    expect(getOrCreateRequestId(id)).toBe(id);
  });

  it('generates UUID when header missing or invalid', () => {
    const a = getOrCreateRequestId(undefined);
    const b = getOrCreateRequestId('bad');
    expect(a).toMatch(/^[0-9a-f-]{36}$/i);
    expect(b).toMatch(/^[0-9a-f-]{36}$/i);
    expect(a).not.toBe(b);
  });
});
