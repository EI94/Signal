import { describe, expect, it } from 'vitest';
import { normalizeBodyForFingerprint, sha256Hex } from './content-hash';

describe('normalizeBodyForFingerprint', () => {
  it('normalizes text line endings', () => {
    const enc = new TextEncoder();
    const ab = enc.encode('a\r\nb\rc').buffer;
    const out = normalizeBodyForFingerprint(ab, 'text/html; charset=utf-8');
    const round = new TextDecoder().decode(out);
    expect(round).toBe('a\nb\nc');
  });

  it('leaves pdf bytes unchanged', () => {
    const raw = new Uint8Array([0, 255, 128]).buffer;
    const out = normalizeBodyForFingerprint(raw, 'application/pdf');
    expect(Array.from(out)).toEqual([0, 255, 128]);
  });
});

describe('sha256Hex', () => {
  it('is deterministic', () => {
    const a = sha256Hex(new TextEncoder().encode('hello'));
    const b = sha256Hex(new TextEncoder().encode('hello'));
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
