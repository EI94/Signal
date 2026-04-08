import { z } from 'zod';
import { type SignalInternalToolName, SignalInternalToolNameSchema } from './internal-tools';

/**
 * WS5.4 — thin orchestration boundary over the internal tool registry.
 * Provider-agnostic; no LLM. Maps one tool invocation to a typed envelope + optional usage.
 */

export const SignalToolExecutionStatusSchema = z.enum([
  'success',
  'validation_error',
  'execution_error',
  'unavailable',
  'not_implemented',
]);

export type SignalToolExecutionStatus = z.infer<typeof SignalToolExecutionStatusSchema>;

export const SignalToolExecutionErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  invokeError: z.enum(['validation', 'execution', 'not_implemented', 'unavailable']).optional(),
  details: z.unknown().optional(),
});

export type SignalToolExecutionError = z.infer<typeof SignalToolExecutionErrorSchema>;

/** Minimal metering record for WS10; optional on success responses. */
export const SignalToolExecutionUsageSchema = z.object({
  tool: SignalInternalToolNameSchema,
  outcome: SignalToolExecutionStatusSchema,
  durationMs: z.number().int().nonnegative(),
  correlationId: z.string().max(256).optional(),
  idempotencyKey: z.string().max(256).optional(),
});

export type SignalToolExecutionUsage = z.infer<typeof SignalToolExecutionUsageSchema>;

export const SignalToolExecutionRequestSchema = z.object({
  tool: SignalInternalToolNameSchema,
  input: z.unknown(),
  correlationId: z.string().max(256).optional(),
  idempotencyKey: z.string().max(256).optional(),
});

export type SignalToolExecutionRequest = z.infer<typeof SignalToolExecutionRequestSchema>;

export const SignalToolExecutionResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    tool: SignalInternalToolNameSchema,
    output: z.unknown(),
    durationMs: z.number().int().nonnegative(),
    correlationId: z.string().max(256).optional(),
    idempotencyKey: z.string().max(256).optional(),
    usage: SignalToolExecutionUsageSchema.optional(),
  }),
  z.object({
    status: z.literal('validation_error'),
    tool: SignalInternalToolNameSchema.optional(),
    durationMs: z.number().int().nonnegative(),
    correlationId: z.string().max(256).optional(),
    idempotencyKey: z.string().max(256).optional(),
    error: SignalToolExecutionErrorSchema,
  }),
  z.object({
    status: z.literal('execution_error'),
    tool: SignalInternalToolNameSchema,
    durationMs: z.number().int().nonnegative(),
    correlationId: z.string().max(256).optional(),
    idempotencyKey: z.string().max(256).optional(),
    error: SignalToolExecutionErrorSchema,
  }),
  z.object({
    status: z.literal('unavailable'),
    tool: SignalInternalToolNameSchema,
    durationMs: z.number().int().nonnegative(),
    correlationId: z.string().max(256).optional(),
    idempotencyKey: z.string().max(256).optional(),
    error: SignalToolExecutionErrorSchema,
  }),
  z.object({
    status: z.literal('not_implemented'),
    tool: SignalInternalToolNameSchema,
    durationMs: z.number().int().nonnegative(),
    correlationId: z.string().max(256).optional(),
    idempotencyKey: z.string().max(256).optional(),
    error: SignalToolExecutionErrorSchema,
  }),
]);

export type SignalToolExecutionResponse = z.infer<typeof SignalToolExecutionResponseSchema>;

/** Map registry invoke error codes to orchestrator HTTP-style status (no provider logic). */
export function mapInvokeErrorToExecutionStatus(
  invokeError: 'validation' | 'execution' | 'not_implemented' | 'unavailable',
): SignalToolExecutionStatus {
  switch (invokeError) {
    case 'validation':
      return 'validation_error';
    case 'execution':
      return 'execution_error';
    case 'unavailable':
      return 'unavailable';
    case 'not_implemented':
      return 'not_implemented';
  }
}

export type ToolOrchestrationMetering = {
  onExecutionStart?: (e: {
    tool: SignalInternalToolName;
    correlationId?: string;
    idempotencyKey?: string;
  }) => void;
  /** `tool` omitted when the execution request envelope failed validation (unknown tool name, etc.). */
  onExecutionFinish?: (e: {
    tool?: SignalInternalToolName;
    status: SignalToolExecutionStatus;
    durationMs: number;
    correlationId?: string;
    idempotencyKey?: string;
  }) => void;
};

export function httpStatusForToolExecutionResponse(r: SignalToolExecutionResponse): number {
  switch (r.status) {
    case 'success':
      return 200;
    case 'validation_error':
      return 400;
    case 'not_implemented':
      return 501;
    case 'unavailable':
      return 503;
    case 'execution_error':
      return 500;
  }
}
