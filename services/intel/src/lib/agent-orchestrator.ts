import {
  mapInvokeErrorToExecutionStatus,
  type SignalToolExecutionRequest,
  SignalToolExecutionRequestSchema,
  type SignalToolExecutionResponse,
  type SignalToolExecutionStatus,
  safeParseInternalToolSuccessOutput,
  type ToolOrchestrationMetering,
} from '@signal/contracts';
import {
  executeSignalInternalTool,
  type InternalToolExecutionContext,
} from './internal-tool-registry';

export type AgentOrchestratorContext = {
  tool: InternalToolExecutionContext;
  metering?: ToolOrchestrationMetering;
};

function buildUsage(
  tool: SignalToolExecutionRequest['tool'],
  outcome: SignalToolExecutionStatus,
  durationMs: number,
  correlationId: string | undefined,
  idempotencyKey: string | undefined,
) {
  return {
    tool,
    outcome,
    durationMs,
    ...(correlationId !== undefined ? { correlationId } : {}),
    ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
  };
}

/**
 * Single-step tool execution: validate request envelope → delegate to internal tool registry →
 * guardrail output parse → typed response. No provider dispatch, no planning.
 */
export async function executeSignalToolRequest(
  raw: unknown,
  ctx: AgentOrchestratorContext,
): Promise<SignalToolExecutionResponse> {
  const t0 = Date.now();
  const parsed = SignalToolExecutionRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const durationMs = Date.now() - t0;
    ctx.metering?.onExecutionFinish?.({
      status: 'validation_error',
      durationMs,
    });
    return {
      status: 'validation_error',
      durationMs,
      error: {
        code: 'invalid_execution_request',
        message: 'request failed schema validation',
        details: parsed.error.flatten(),
      },
    };
  }

  const { tool, input, correlationId, idempotencyKey } = parsed.data;
  ctx.metering?.onExecutionStart?.({ tool, correlationId, idempotencyKey });

  const invoke = await executeSignalInternalTool(tool, input, ctx.tool);
  const durationMs = Date.now() - t0;

  if (!invoke.ok) {
    const status = mapInvokeErrorToExecutionStatus(invoke.error);
    ctx.metering?.onExecutionFinish?.({
      tool,
      status,
      durationMs,
      correlationId,
      idempotencyKey,
    });
    const errorPayload = {
      code: invoke.error,
      message: invoke.message,
      invokeError: invoke.error,
      ...(invoke.details !== undefined ? { details: invoke.details } : {}),
    };
    switch (invoke.error) {
      case 'validation':
        return {
          status: 'validation_error' as const,
          tool,
          durationMs,
          correlationId,
          idempotencyKey,
          error: errorPayload,
        };
      case 'execution':
        return {
          status: 'execution_error' as const,
          tool,
          durationMs,
          correlationId,
          idempotencyKey,
          error: errorPayload,
        };
      case 'unavailable':
        return {
          status: 'unavailable' as const,
          tool,
          durationMs,
          correlationId,
          idempotencyKey,
          error: errorPayload,
        };
      case 'not_implemented':
        return {
          status: 'not_implemented' as const,
          tool,
          durationMs,
          correlationId,
          idempotencyKey,
          error: errorPayload,
        };
    }
  }

  const out = safeParseInternalToolSuccessOutput(tool, invoke.output);
  if (!out.ok) {
    ctx.metering?.onExecutionFinish?.({
      tool,
      status: 'execution_error',
      durationMs,
      correlationId,
      idempotencyKey,
    });
    return {
      status: 'execution_error',
      tool,
      durationMs,
      correlationId,
      idempotencyKey,
      error: {
        code: 'output_validation_failed',
        message: 'tool output failed contract validation',
        details: out.error.flatten(),
      },
    };
  }

  ctx.metering?.onExecutionFinish?.({
    tool,
    status: 'success',
    durationMs,
    correlationId,
    idempotencyKey,
  });

  return {
    status: 'success',
    tool,
    output: out.data,
    durationMs,
    correlationId,
    idempotencyKey,
    usage: buildUsage(tool, 'success', durationMs, correlationId, idempotencyKey),
  };
}
