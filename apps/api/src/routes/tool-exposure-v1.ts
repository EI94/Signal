import type { BigQuery } from '@google-cloud/bigquery';
import type { ApiRuntimeConfig } from '@signal/config';
import {
  EXPOSED_TOOL_DESCRIPTORS,
  listMcpReadyCapabilities,
  McpReadyCapabilitiesListV1ResponseSchema,
  ToolExposureExecuteRequestSchema,
  ToolExposureExecuteResponseSchema,
  ToolsExposureListV1ResponseSchema,
} from '@signal/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { sendErrorResponse } from '../lib/api-error';
import { invokeViaMcpReadyAdapter } from '../lib/tool-exposure/mcp-ready-adapter';
import { requireAuth } from '../plugins/auth';
import { createResolveWorkspaceMembership } from '../plugins/workspace';

/**
 * WS11.1 / WS11.2 — Product-facing exposed tools (authenticated; workspace from membership).
 * GET `/tools` lists static descriptors; GET `/tools/capabilities` lists MCP-ready projections;
 * POST `/tools/execute` invokes via `invokeViaMcpReadyAdapter` (read models in-process, actions via intel HTTP when configured).
 */
export const toolExposureV1Routes: FastifyPluginAsync<{
  config: ApiRuntimeConfig;
  bigquery: BigQuery | null;
}> = async (app, opts) => {
  const { config, bigquery } = opts;
  const resolveWorkspace = createResolveWorkspaceMembership(config);
  const pre = [requireAuth, resolveWorkspace] as const;

  app.get('/tools', { preHandler: [...pre] }, async (_request, _reply) => {
    const body = { tools: [...EXPOSED_TOOL_DESCRIPTORS] };
    return ToolsExposureListV1ResponseSchema.parse(body);
  });

  app.get('/tools/capabilities', { preHandler: [...pre] }, async (_request, _reply) => {
    const body = { capabilities: [...listMcpReadyCapabilities()] };
    return McpReadyCapabilitiesListV1ResponseSchema.parse(body);
  });

  app.post<{ Body: unknown }>(
    '/tools/execute',
    { preHandler: [...pre] },
    async (request, reply) => {
      const wc = request.workspaceContext;
      if (!wc) {
        await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Workspace context missing');
        return;
      }

      const reqParsed = ToolExposureExecuteRequestSchema.safeParse(request.body ?? {});
      if (!reqParsed.success) {
        await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid request body');
        return;
      }

      const result = await invokeViaMcpReadyAdapter({
        config,
        bigquery,
        workspaceId: wc.id,
        tool: reqParsed.data.tool,
        rawInput: reqParsed.data.input,
        correlationId: reqParsed.data.correlationId,
        idempotencyKey: reqParsed.data.idempotencyKey,
      });

      if (result.ok) {
        const envelope = ToolExposureExecuteResponseSchema.parse({
          ok: true,
          tool: result.tool,
          kind: result.kind,
          output: result.output,
        });
        return envelope;
      }

      const code = result.code;
      const status =
        code === 'VALIDATION_ERROR'
          ? 400
          : code === 'UNAVAILABLE'
            ? 503
            : code === 'UPSTREAM_ERROR'
              ? 502
              : 500;

      const envelope = ToolExposureExecuteResponseSchema.parse({
        ok: false,
        tool: result.tool,
        code,
        message: result.message,
        ...(result.details !== undefined ? { details: result.details } : {}),
      });

      await reply.code(status).send(envelope);
    },
  );
};
