import type { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { SecurityAuditEvent } from './audit-events';
import { logSecurityEvent } from './security-log';

describe('logSecurityEvent', () => {
  it('emits structured fields without tokens', () => {
    const info = vi.fn();
    const request = {
      id: 'req-1',
      method: 'GET',
      url: '/v1/auth/me',
      routeOptions: { url: '/v1/auth/me' },
      log: { info },
    } as unknown as FastifyRequest;

    logSecurityEvent(request, SecurityAuditEvent.AuthMissingToken, {
      outcome: 'failure',
      reasonCode: 'MISSING_AUTHORIZATION',
    });

    expect(info).toHaveBeenCalledTimes(1);
    const first = info.mock.calls[0]?.[0];
    expect(first).toBeDefined();
    const payload = first as Record<string, unknown>;
    expect(payload.kind).toBe('security');
    expect(payload.eventType).toBe('auth.missing_token');
    expect(payload.requestId).toBe('req-1');
    expect(payload).not.toHaveProperty('authorization');
  });
});
