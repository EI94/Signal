import { describe, expect, it } from 'vitest';
import { deriveSourceContentId } from '../source-content-id';

describe('deriveSourceContentId', () => {
  it('is stable for the same inputs', () => {
    const fp = 'a'.repeat(64);
    const a = deriveSourceContentId('3fa85f64-5717-4562-b3fc-2c963f66afa6', fp);
    const b = deriveSourceContentId('3fa85f64-5717-4562-b3fc-2c963f66afa6', fp);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{32}$/);
  });

  it('differs when fingerprint differs', () => {
    const fp1 = 'a'.repeat(64);
    const fp2 = 'b'.repeat(64);
    const a = deriveSourceContentId('3fa85f64-5717-4562-b3fc-2c963f66afa6', fp1);
    const b = deriveSourceContentId('3fa85f64-5717-4562-b3fc-2c963f66afa6', fp2);
    expect(a).not.toBe(b);
  });
});
