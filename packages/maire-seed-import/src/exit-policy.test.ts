import { describe, expect, it } from 'vitest';
import { shouldExitFailure } from './exit-policy';

describe('shouldExitFailure', () => {
  it('dry-run without strict tolerates invalid', () => {
    expect(shouldExitFailure(3, false, false)).toBe(false);
  });

  it('dry-run with strict fails on invalid', () => {
    expect(shouldExitFailure(1, false, true)).toBe(true);
  });

  it('apply fails on invalid', () => {
    expect(shouldExitFailure(1, true, false)).toBe(true);
  });

  it('zero invalid never fails', () => {
    expect(shouldExitFailure(0, true, true)).toBe(false);
  });
});
