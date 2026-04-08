import { z } from 'zod';

/**
 * Stable JSON error body for product APIs — matches `sendErrorResponse` in apps/api (`ApiErrorBody`).
 * Use for documentation and client-side parsing; routes validate at the edge as needed.
 */
export const ApiErrorEnvelopeV1Schema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.string().min(1),
  }),
});

export type ApiErrorEnvelopeV1 = z.infer<typeof ApiErrorEnvelopeV1Schema>;
