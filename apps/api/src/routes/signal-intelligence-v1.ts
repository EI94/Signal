import type { ApiRuntimeConfig } from '@signal/config';
import type { FastifyPluginAsync } from 'fastify';
import { sendErrorResponse } from '../lib/api-error';
import { getCloudRunAuthorizationHeader } from '../lib/cloud-run-id-token';
import { optionalVerifyAuth } from '../plugins/auth';
import { createResolveWorkspacePublicOrMember } from '../plugins/workspace';

async function proxyToIntel(
  config: ApiRuntimeConfig,
  path: string,
  opts: { method?: string; body?: unknown; timeout?: number } = {},
): Promise<{ status: number; json: unknown }> {
  if (!config.toolIntelBaseUrl) {
    return { status: 503, json: { ok: false, error: 'intel_service_unavailable' } };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.toolIntelSecret) {
    headers['x-signal-intel-secret'] = config.toolIntelSecret;
  }
  const authz = await getCloudRunAuthorizationHeader(config.toolIntelBaseUrl);
  if (authz) headers['Authorization'] = authz;

  const resp = await fetch(`${config.toolIntelBaseUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(opts.timeout ?? 60_000),
  });

  const json = await resp.json().catch(() => ({ ok: false, error: 'invalid_response' }));
  return { status: resp.status, json };
}

export const signalIntelligenceV1Routes: FastifyPluginAsync<{
  config: ApiRuntimeConfig;
}> = async (app, opts) => {
  const { config } = opts;
  const resolvePublicOrMember = createResolveWorkspacePublicOrMember(config);
  const prePublicRead = [optionalVerifyAuth, resolvePublicOrMember] as const;

  app.get<{ Params: { signalId: string } }>(
    '/signals/:signalId/enrich',
    { preHandler: [...prePublicRead] },
    async (request, reply) => {
      const wc = request.workspaceContext;
      if (!wc) {
        await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Workspace context missing');
        return;
      }

      const { status, json } = await proxyToIntel(
        config,
        `/internal/enrich-signal/${request.params.signalId}?workspaceId=${encodeURIComponent(wc.id)}`,
        { timeout: 30_000 },
      );

      return reply.code(status).send(json);
    },
  );

  app.post<{ Params: { signalId: string }; Body: unknown }>(
    '/signals/:signalId/chat',
    { preHandler: [...prePublicRead] },
    async (request, reply) => {
      const wc = request.workspaceContext;
      if (!wc) {
        await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Workspace context missing');
        return;
      }

      const body = request.body as Record<string, unknown> | null;

      const { status, json } = await proxyToIntel(
        config,
        `/internal/signal-chat/${request.params.signalId}`,
        {
          method: 'POST',
          body: {
            workspaceId: wc.id,
            message: body?.message,
            history: body?.history,
            provider: body?.provider,
          },
          timeout: 60_000,
        },
      );

      return reply.code(status).send(json);
    },
  );

  app.post('/pulse/live-refresh', async (_request, reply) => {
    if (!config.toolIntelBaseUrl) {
      return reply.code(503).send({ ok: false, error: 'intel_service_unavailable' });
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.toolIntelSecret) {
      headers['x-signal-intel-secret'] = config.toolIntelSecret;
    }
    const lrAuthz = await getCloudRunAuthorizationHeader(config.toolIntelBaseUrl);
    if (lrAuthz) headers['Authorization'] = lrAuthz;

    try {
      const resp = await fetch(`${config.toolIntelBaseUrl}/internal/trigger-ingest`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(10_000),
      });
      const json = await resp.json().catch(() => ({}));
      return reply.send({ ok: true, triggered: true, detail: json });
    } catch {
      return reply.send({ ok: true, triggered: false, message: 'ingest_trigger_best_effort' });
    }
  });
};
