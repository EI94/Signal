import type { BigQuery } from '@google-cloud/bigquery';
import type { ApiRuntimeConfig } from '@signal/config';
import type { ExposedToolName } from '@signal/contracts';
import { parseExposedToolInput } from '@signal/contracts';
import { executeExposedTool, type ToolExposureExecuteResult } from './execute-exposed-tool';

/**
 * WS11.2 — Thin MCP-ready boundary: validate exposed-tool input, then delegate to `executeExposedTool`
 * (same path as POST /v1/tools/execute). No transport, no MCP protocol, no second orchestrator.
 */
export async function invokeViaMcpReadyAdapter(params: {
  readonly config: ApiRuntimeConfig;
  readonly bigquery: BigQuery | null;
  readonly workspaceId: string;
  readonly tool: ExposedToolName;
  readonly rawInput: unknown;
  readonly correlationId?: string;
  readonly idempotencyKey?: string;
}): Promise<ToolExposureExecuteResult> {
  const parsed = parseExposedToolInput(params.tool, params.rawInput);
  if (!parsed.ok) {
    return {
      ok: false,
      tool: params.tool,
      code: 'VALIDATION_ERROR',
      message: 'invalid_tool_input',
      details: parsed.error.flatten(),
    };
  }
  return executeExposedTool({
    config: params.config,
    bigquery: params.bigquery,
    workspaceId: params.workspaceId,
    parsed: parsed.data,
    correlationId: params.correlationId,
    idempotencyKey: params.idempotencyKey,
  });
}
