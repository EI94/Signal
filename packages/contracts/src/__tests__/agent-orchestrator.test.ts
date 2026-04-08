import { describe, expect, it } from 'vitest';
import {
  httpStatusForToolExecutionResponse,
  mapInvokeErrorToExecutionStatus,
  SignalToolExecutionRequestSchema,
  SignalToolExecutionResponseSchema,
} from '../agent-orchestrator';

describe('agent-orchestrator contracts', () => {
  it('parses a minimal execution request', () => {
    const r = SignalToolExecutionRequestSchema.parse({
      tool: 'score_signal',
      input: { sourceContentId: 'aa'.repeat(16), observedAt: '2026-04-04T12:00:00.000Z' },
      correlationId: 'corr-1',
    });
    expect(r.tool).toBe('score_signal');
    expect(r.correlationId).toBe('corr-1');
  });

  it('rejects unknown tool names', () => {
    expect(() =>
      SignalToolExecutionRequestSchema.parse({ tool: 'unknown_tool', input: {} }),
    ).toThrow();
  });

  it('maps invoke errors to execution status', () => {
    expect(mapInvokeErrorToExecutionStatus('validation')).toBe('validation_error');
    expect(mapInvokeErrorToExecutionStatus('execution')).toBe('execution_error');
    expect(mapInvokeErrorToExecutionStatus('unavailable')).toBe('unavailable');
    expect(mapInvokeErrorToExecutionStatus('not_implemented')).toBe('not_implemented');
  });

  it('maps HTTP status codes for responses', () => {
    expect(
      httpStatusForToolExecutionResponse({
        status: 'success',
        tool: 'fetch_source',
        output: {},
        durationMs: 1,
      }),
    ).toBe(200);
    expect(
      httpStatusForToolExecutionResponse({
        status: 'validation_error',
        durationMs: 1,
        error: { code: 'x', message: 'y' },
      }),
    ).toBe(400);
    expect(
      httpStatusForToolExecutionResponse({
        status: 'not_implemented',
        tool: 'generate_brief',
        durationMs: 1,
        error: { code: 'not_implemented', message: 'n' },
      }),
    ).toBe(501);
    expect(
      httpStatusForToolExecutionResponse({
        status: 'unavailable',
        tool: 'fetch_source',
        durationMs: 1,
        error: { code: 'unavailable', message: 'n' },
      }),
    ).toBe(503);
    expect(
      httpStatusForToolExecutionResponse({
        status: 'execution_error',
        tool: 'extract_events',
        durationMs: 1,
        error: { code: 'execution', message: 'n' },
      }),
    ).toBe(500);
  });

  it('round-trips a success response through the schema', () => {
    const res = {
      status: 'success' as const,
      tool: 'extract_events' as const,
      output: { ok: true, skipped: true, reason: 'extraction_disabled' as const },
      durationMs: 3,
    };
    expect(SignalToolExecutionResponseSchema.parse(res).status).toBe('success');
  });
});
