import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '../index';

describe('HealthResponseSchema', () => {
  it('validates a correct health response', () => {
    const result = HealthResponseSchema.safeParse({
      service: 'test',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '0.0.0',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid status', () => {
    const result = HealthResponseSchema.safeParse({
      service: 'test',
      status: 'invalid',
      timestamp: new Date().toISOString(),
      version: '0.0.0',
    });
    expect(result.success).toBe(false);
  });
});
