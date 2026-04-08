import type { FastifyReply, FastifyRequest } from 'fastify';

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
};

/**
 * Stable JSON error shape for API routes (includes request ID, no stack traces).
 */
export async function sendErrorResponse(
  reply: FastifyReply,
  request: FastifyRequest,
  status: number,
  code: string,
  message: string,
): Promise<void> {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      requestId: request.id,
    },
  };
  await reply.code(status).send(body);
}
