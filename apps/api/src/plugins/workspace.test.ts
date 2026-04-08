import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { requireRole } from './workspace';

function mockReply() {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockResolvedValue(undefined),
  };
  return reply as unknown as FastifyReply;
}

function baseRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    id: 'req-test',
    method: 'GET',
    url: '/v1/auth/analyst-probe',
    routeOptions: { url: '/v1/auth/analyst-probe' },
    log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), child: vi.fn() },
    ...overrides,
  } as unknown as FastifyRequest;
}

describe('requireRole', () => {
  it('does not send when role meets minimum', async () => {
    const request = baseRequest({ effectiveRole: 'admin' });
    const reply = mockReply();
    await requireRole('analyst')(request, reply);
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('returns 403 when role is below minimum', async () => {
    const request = baseRequest({
      effectiveRole: 'viewer',
      authUser: { uid: 'u1' } as FastifyRequest['authUser'],
      workspaceContext: { id: 'ws1', name: 'W', slug: null },
    });
    const reply = mockReply();
    await requireRole('analyst')(request, reply);
    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'INSUFFICIENT_ROLE', requestId: 'req-test' }),
      }),
    );
  });

  it('returns 403 when role is missing', async () => {
    const request = baseRequest();
    const reply = mockReply();
    await requireRole('viewer')(request, reply);
    expect(reply.code).toHaveBeenCalledWith(403);
  });
});
