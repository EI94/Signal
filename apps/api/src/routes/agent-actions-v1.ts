import type { BigQuery } from '@google-cloud/bigquery';
import type { ApiRuntimeConfig } from '@signal/config';
import {
  AGENT_DASHBOARD_ACTION_DESCRIPTORS,
  AgentDashboardActionExecuteRequestSchema,
  AgentDashboardActionExecuteResponseSchema,
  AgentDashboardActionsListV1ResponseSchema,
  parseAgentDashboardActionInput,
} from '@signal/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { executeAgentDashboardAction } from '../lib/agent-actions/execute-agent-dashboard-action';
import { sendErrorResponse } from '../lib/api-error';
import { SecurityAuditEvent } from '../lib/audit-events';
import { logSecurityEvent } from '../lib/security-log';
import { requireAuth } from '../plugins/auth';
import { createResolveWorkspaceMembership } from '../plugins/workspace';

/**
 * WS11.3 — Agent→dashboard product actions (authenticated; workspace from membership).
 * Delegates execution to exposed tools via `executeAgentDashboardAction`.
 */
export const agentActionsV1Routes: FastifyPluginAsync<{
  config: ApiRuntimeConfig;
  bigquery: BigQuery | null;
}> = async (app, opts) => {
  const { config, bigquery } = opts;
  const resolveWorkspace = createResolveWorkspaceMembership(config);
  const pre = [requireAuth, resolveWorkspace] as const;

  app.get('/actions', { preHandler: [...pre] }, async (_request, _reply) => {
    const body = { actions: [...AGENT_DASHBOARD_ACTION_DESCRIPTORS] };
    return AgentDashboardActionsListV1ResponseSchema.parse(body);
  });

  app.post<{ Body: unknown }>(
    '/actions/execute',
    { preHandler: [...pre] },
    async (request, reply) => {
      const wc = request.workspaceContext;
      if (!wc) {
        await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Workspace context missing');
        return;
      }

      const reqParsed = AgentDashboardActionExecuteRequestSchema.safeParse(request.body ?? {});
      if (!reqParsed.success) {
        await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid request body');
        return;
      }

      const inputParsed = parseAgentDashboardActionInput(
        reqParsed.data.action,
        reqParsed.data.input,
      );
      if (!inputParsed.ok) {
        await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid action input');
        return;
      }

      const result = await executeAgentDashboardAction({
        config,
        bigquery,
        workspaceId: wc.id,
        parsed: inputParsed.data,
        correlationId: reqParsed.data.correlationId,
      });

      logSecurityEvent(request, SecurityAuditEvent.AgentDashboardActionExecuted, {
        outcome: result.ok ? 'success' : 'failure',
        uid: request.authUser?.uid ?? null,
        workspaceId: wc.id,
        reasonCode: reqParsed.data.action,
      });

      if (result.ok) {
        return AgentDashboardActionExecuteResponseSchema.parse(result);
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

      const envelope = AgentDashboardActionExecuteResponseSchema.parse(result);
      await reply.code(status).send(envelope);
    },
  );
};
