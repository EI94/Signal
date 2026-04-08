import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { sendErrorResponse } from './api-error';

describe('sendErrorResponse', () => {
  it('sends stable error shape with requestId', async () => {
    const reply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockResolvedValue(undefined),
    } as unknown as FastifyReply;

    const request = { id: 'rid-xyz' } as FastifyRequest;

    await sendErrorResponse(reply, request, 403, 'NOT_A_MEMBER', 'Nope');

    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      error: {
        code: 'NOT_A_MEMBER',
        message: 'Nope',
        requestId: 'rid-xyz',
      },
    });
  });
});
