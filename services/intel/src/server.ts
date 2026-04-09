/**
 * services/intel — Downstream intake (SourceContent) and future extraction/scoring.
 * See docs/architecture/data-flow-v2.md
 */

import { loadIntelRuntimeConfig } from '@signal/config';
import {
  EvaluateAlertsRequestSchema,
  EvaluateAlertsResponseSchema,
  ExtractSourceContentRequestSchema,
  GenerateMorningBriefRequestSchema,
  type HealthResponse,
  httpStatusForToolExecutionResponse,
  MorningBriefGenerationResultSchema,
  PromoteSourceContentSignalsRequestSchema,
  parseSourceContentPersistedForIntel,
  SendAlertEmailRequestSchema,
  SendBriefEmailRequestSchema,
  SendEmailDeliveryResponseSchema,
} from '@signal/contracts';
import Fastify from 'fastify';
import { executeSignalToolRequest } from './lib/agent-orchestrator';
import { evaluateAlertsForSignal } from './lib/evaluate-alerts-for-signal';
import { evaluateUserAlertsForSignal } from './lib/evaluate-user-alerts';
import { getFirestoreDb, initFirebaseAdmin } from './lib/firebase-admin';
import {
  createDefaultGenerateMorningBriefDeps,
  generateMorningBrief,
} from './lib/generate-morning-brief';
import { checkAlertCooldown, insertAlertEvaluationRows } from './lib/persist-alert-evaluation';
import {
  createDefaultExtractDeps,
  processExtractSourceContent,
} from './lib/process-extract-source-content';
import {
  createDefaultPromoteDeps,
  processPromoteSourceContentSignals,
} from './lib/process-promote-source-content-signals';
import {
  createDefaultProcessDeps,
  processSourceContentPersisted,
} from './lib/process-source-content-persisted';
import {
  meterIntelAlerts,
  meterIntelBriefGenerate,
  meterIntelEmailSend,
  meterIntelExtract,
  meterIntelExtractFailure,
  meterIntelNormalization,
  meterIntelPromote,
  meterIntelPromoteFailure,
  meterIntelToolExecute,
} from './lib/record-usage-metering';
import { createDefaultSendAlertEmailDeps, sendAlertEmail } from './lib/send-alert-email';
import { createDefaultSendBriefEmailDeps, sendBriefEmail } from './lib/send-brief-email';
import type { OrchestratePipelineRequest } from './lib/orchestrate-pipeline';

const config = loadIntelRuntimeConfig();

async function start() {
  initFirebaseAdmin(config.firebaseProjectId);
  const db = getFirestoreDb();

  const app = Fastify({ logger: { level: config.logLevel } });

  app.get(
    '/healthz',
    async (): Promise<HealthResponse> => ({
      service: config.serviceName,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: config.version,
    }),
  );

  app.get('/readiness', async (request, reply): Promise<HealthResponse> => {
    try {
      await db.collection('workspaces').limit(1).get();
      return {
        service: config.serviceName,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: config.version,
      };
    } catch (err) {
      request.log.error({ err }, 'readiness_firestore_failed');
      reply.code(503);
      return {
        service: config.serviceName,
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        version: config.version,
      };
    }
  });

  app.post<{ Body: unknown }>('/internal/source-content-persisted', async (request, reply) => {
    if (config.intelInternalSecret !== null) {
      const provided = request.headers['x-signal-intel-secret'];
      if (provided !== config.intelInternalSecret) {
        return reply.code(401).send({ ok: false, error: 'unauthorized' });
      }
    }

    const parsed = parseSourceContentPersistedForIntel(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ ok: false, error: 'invalid_payload', details: parsed.error.flatten() });
    }

    if (parsed.envelope) {
      request.log.info(
        {
          step: 'intel.source_content_intake',
          correlationId: parsed.envelope.correlationId,
          idempotencyKey: parsed.envelope.idempotencyKey,
        },
        'pipeline handoff envelope',
      );
    }

    try {
      const deps = createDefaultProcessDeps(config);
      const result = await processSourceContentPersisted(parsed.data, config, deps);
      const wsId = parsed.data.workspaceId ?? config.defaultWorkspaceId;
      void meterIntelNormalization(config, result, wsId, request.log);
      return reply.send({ ok: true, result });
    } catch (err) {
      request.log.error({ err }, 'processSourceContentPersisted failed');
      const message = err instanceof Error ? err.message : 'unknown_error';
      return reply.code(500).send({ ok: false, error: message });
    }
  });

  app.post<{ Body: unknown }>('/internal/extract-source-content', async (request, reply) => {
    if (config.intelInternalSecret !== null) {
      const provided = request.headers['x-signal-intel-secret'];
      if (provided !== config.intelInternalSecret) {
        return reply.code(401).send({ ok: false, error: 'unauthorized' });
      }
    }

    const parsed = ExtractSourceContentRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ ok: false, error: 'invalid_payload', details: parsed.error.flatten() });
    }

    try {
      const deps = createDefaultExtractDeps(config);
      const result = await processExtractSourceContent(parsed.data, config, deps);
      const ws = config.defaultWorkspaceId;
      void meterIntelExtract(config, result, ws, parsed.data.sourceContentId, request.log);
      return reply.send({ ok: true, result });
    } catch (err) {
      request.log.error({ err }, 'processExtractSourceContent failed');
      const message = err instanceof Error ? err.message : 'unknown_error';
      const ws = config.defaultWorkspaceId;
      void meterIntelExtractFailure(config, ws, parsed.data.sourceContentId, message, request.log);
      return reply.code(500).send({ ok: false, error: message });
    }
  });

  app.post<{ Body: unknown }>('/internal/tools/execute', async (request, reply) => {
    if (config.intelInternalSecret !== null) {
      const provided = request.headers['x-signal-intel-secret'];
      if (provided !== config.intelInternalSecret) {
        return reply.code(401).send({ ok: false, error: 'unauthorized' });
      }
    }

    const result = await executeSignalToolRequest(request.body ?? {}, {
      tool: { config },
      metering: {
        onExecutionFinish: (e) => {
          void meterIntelToolExecute(
            config,
            {
              workspaceId: config.defaultWorkspaceId,
              tool: e.tool,
              status: e.status,
              durationMs: e.durationMs,
              correlationId: e.correlationId,
              idempotencyKey: e.idempotencyKey,
            },
            request.log,
          );
        },
      },
    });
    return reply.code(httpStatusForToolExecutionResponse(result)).send(result);
  });

  app.post<{ Body: unknown }>(
    '/internal/promote-source-content-signals',
    async (request, reply) => {
      if (config.intelInternalSecret !== null) {
        const provided = request.headers['x-signal-intel-secret'];
        if (provided !== config.intelInternalSecret) {
          return reply.code(401).send({ ok: false, error: 'unauthorized' });
        }
      }

      const parsed = PromoteSourceContentSignalsRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ ok: false, error: 'invalid_payload', details: parsed.error.flatten() });
      }

      try {
        const deps = createDefaultPromoteDeps(config);
        const result = await processPromoteSourceContentSignals(parsed.data, config, deps);
        const ws = parsed.data.workspaceId ?? config.defaultWorkspaceId;
        void meterIntelPromote(config, result, ws, parsed.data.sourceContentId, request.log);
        return reply.send({ ok: true, result });
      } catch (err) {
        request.log.error({ err }, 'processPromoteSourceContentSignals failed');
        const message = err instanceof Error ? err.message : 'unknown_error';
        const ws = parsed.data.workspaceId ?? config.defaultWorkspaceId;
        void meterIntelPromoteFailure(
          config,
          ws,
          parsed.data.sourceContentId,
          message,
          request.log,
        );
        return reply.code(500).send({ ok: false, error: message });
      }
    },
  );

  app.post<{ Body: unknown }>('/internal/evaluate-alerts', async (request, reply) => {
    if (config.intelInternalSecret !== null) {
      const provided = request.headers['x-signal-intel-secret'];
      if (provided !== config.intelInternalSecret) {
        return reply.code(401).send({ ok: false, error: 'unauthorized' });
      }
    }

    if (!config.alertEvaluationEnabled) {
      return reply.code(200).send({ ok: true, skipped: true, reason: 'alert_evaluation_disabled' });
    }

    const parsed = EvaluateAlertsRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ ok: false, error: 'invalid_payload', details: parsed.error.flatten() });
    }

    const workspaceId = parsed.data.workspaceId ?? config.defaultWorkspaceId;
    if (!workspaceId) {
      return reply.code(400).send({
        ok: false,
        error: 'workspace_id_required',
      });
    }

    try {
      const result = await evaluateAlertsForSignal(
        {
          workspaceId,
          signalId: parsed.data.signalId,
          evaluationRunId: parsed.data.evaluationRunId,
        },
        config,
        {
          getFirestoreDb,
          checkCooldown: checkAlertCooldown,
          insertEvaluations: insertAlertEvaluationRows,
        },
      );
      const validated = EvaluateAlertsResponseSchema.safeParse(result);
      if (!validated.success) {
        request.log.error(
          { issues: validated.error.flatten() },
          'evaluate-alerts response validation failed',
        );
        return reply.code(500).send({ ok: false, error: 'response_validation_failed' });
      }
      void meterIntelAlerts(config, validated.data, workspaceId, parsed.data.signalId, request.log);
      return reply.send({ ok: true, result: validated.data });
    } catch (err) {
      request.log.error({ err }, 'evaluateAlertsForSignal failed');
      const message = err instanceof Error ? err.message : 'unknown_error';
      return reply.code(500).send({ ok: false, error: message });
    }
  });

  app.post<{ Body: unknown }>('/internal/generate-brief', async (request, reply) => {
    if (config.intelInternalSecret !== null) {
      const provided = request.headers['x-signal-intel-secret'];
      if (provided !== config.intelInternalSecret) {
        return reply.code(401).send({ ok: false, error: 'unauthorized' });
      }
    }

    if (!config.briefGenerationEnabled) {
      return reply.code(200).send({ ok: true, skipped: true, reason: 'brief_generation_disabled' });
    }

    const parsed = GenerateMorningBriefRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ ok: false, error: 'invalid_payload', details: parsed.error.flatten() });
    }

    const workspaceId = parsed.data.workspaceId ?? config.defaultWorkspaceId;
    if (!workspaceId) {
      return reply.code(400).send({
        ok: false,
        error: 'workspace_id_required',
      });
    }

    try {
      const result = await generateMorningBrief(
        { ...parsed.data, workspaceId },
        config,
        createDefaultGenerateMorningBriefDeps(config),
      );
      const validated = MorningBriefGenerationResultSchema.safeParse(result);
      if (!validated.success) {
        request.log.error(
          { issues: validated.error.flatten() },
          'generate-brief response validation failed',
        );
        return reply.code(500).send({ ok: false, error: 'response_validation_failed' });
      }
      void meterIntelBriefGenerate(
        config,
        {
          workspaceId,
          briefId: validated.data.briefId,
          sourceSignalCount: validated.data.sourceSignalIds.length,
          modelAssisted: validated.data.modelAssisted,
          markdownChars: validated.data.markdownChars,
        },
        request.log,
      );
      return reply.send({ ok: true, result: validated.data });
    } catch (err) {
      request.log.error({ err }, 'generateMorningBrief failed');
      const message = err instanceof Error ? err.message : 'unknown_error';
      return reply.code(500).send({ ok: false, error: message });
    }
  });

  app.post<{ Body: unknown }>('/internal/send-brief-email', async (request, reply) => {
    if (config.intelInternalSecret !== null) {
      const provided = request.headers['x-signal-intel-secret'];
      if (provided !== config.intelInternalSecret) {
        return reply.code(401).send({ ok: false, error: 'unauthorized' });
      }
    }

    const parsed = SendBriefEmailRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ ok: false, error: 'invalid_payload', details: parsed.error.flatten() });
    }

    const workspaceId = parsed.data.workspaceId ?? config.defaultWorkspaceId;
    if (!workspaceId) {
      return reply.code(400).send({
        ok: false,
        error: 'workspace_id_required',
      });
    }

    try {
      const result = await sendBriefEmail(
        { ...parsed.data, workspaceId },
        config,
        createDefaultSendBriefEmailDeps(config),
      );
      const validated = SendEmailDeliveryResponseSchema.safeParse(result);
      if (!validated.success) {
        request.log.error(
          { issues: validated.error.flatten() },
          'send-brief-email response validation failed',
        );
        return reply.code(500).send({ ok: false, error: 'response_validation_failed' });
      }
      void meterIntelEmailSend(
        config,
        {
          workspaceId,
          kind: 'brief',
          status: validated.data.status,
          deliveryId: validated.data.deliveryId,
        },
        request.log,
      );
      return reply.send({ ok: true, result: validated.data });
    } catch (err) {
      request.log.error({ err }, 'sendBriefEmail failed');
      const message = err instanceof Error ? err.message : 'unknown_error';
      return reply.code(500).send({ ok: false, error: message });
    }
  });

  app.post<{ Body: unknown }>('/internal/send-alert-email', async (request, reply) => {
    if (config.intelInternalSecret !== null) {
      const provided = request.headers['x-signal-intel-secret'];
      if (provided !== config.intelInternalSecret) {
        return reply.code(401).send({ ok: false, error: 'unauthorized' });
      }
    }

    const parsed = SendAlertEmailRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ ok: false, error: 'invalid_payload', details: parsed.error.flatten() });
    }

    const workspaceId = parsed.data.workspaceId ?? config.defaultWorkspaceId;
    if (!workspaceId) {
      return reply.code(400).send({
        ok: false,
        error: 'workspace_id_required',
      });
    }

    try {
      const result = await sendAlertEmail(
        { ...parsed.data, workspaceId },
        config,
        createDefaultSendAlertEmailDeps(config),
      );
      const validated = SendEmailDeliveryResponseSchema.safeParse(result);
      if (!validated.success) {
        request.log.error(
          { issues: validated.error.flatten() },
          'send-alert-email response validation failed',
        );
        return reply.code(500).send({ ok: false, error: 'response_validation_failed' });
      }
      void meterIntelEmailSend(
        config,
        {
          workspaceId,
          kind: 'alert',
          status: validated.data.status,
          deliveryId: validated.data.deliveryId,
        },
        request.log,
      );
      return reply.send({ ok: true, result: validated.data });
    } catch (err) {
      request.log.error({ err }, 'sendAlertEmail failed');
      const message = err instanceof Error ? err.message : 'unknown_error';
      return reply.code(500).send({ ok: false, error: message });
    }
  });

  app.post<{ Body: unknown }>('/internal/evaluate-user-alerts', async (request, reply) => {
    if (config.intelInternalSecret !== null) {
      const provided = request.headers['x-signal-intel-secret'];
      if (provided !== config.intelInternalSecret) {
        return reply.code(401).send({ ok: false, error: 'unauthorized' });
      }
    }

    const body = request.body as { workspaceId?: string; signalId?: string } | null;
    const workspaceId = body?.workspaceId ?? config.defaultWorkspaceId;
    const signalId = body?.signalId;
    if (!workspaceId || !signalId) {
      return reply.code(400).send({ ok: false, error: 'workspace_id and signal_id required' });
    }

    try {
      const result = await evaluateUserAlertsForSignal({ workspaceId, signalId }, config, db);
      return reply.send({ ok: true, result });
    } catch (err) {
      request.log.error({ err }, 'evaluateUserAlertsForSignal failed');
      const message = err instanceof Error ? err.message : 'unknown_error';
      return reply.code(500).send({ ok: false, error: message });
    }
  });

  app.post<{ Body: unknown }>('/internal/orchestrate-pipeline', async (request, reply) => {
    if (config.intelInternalSecret !== null) {
      const provided = request.headers['x-signal-intel-secret'];
      if (provided !== config.intelInternalSecret) {
        return reply.code(401).send({ ok: false, error: 'unauthorized' });
      }
    }

    const body = request.body as Record<string, unknown> | null;
    const sourceContentId = body?.sourceContentId;
    if (!sourceContentId || typeof sourceContentId !== 'string') {
      return reply.code(400).send({ ok: false, error: 'sourceContentId required' });
    }

    try {
      const { orchestratePipeline } = await import('./lib/orchestrate-pipeline');
      const result = await orchestratePipeline(
        {
          sourceContentId,
          workspaceId: typeof body?.workspaceId === 'string' ? body.workspaceId : undefined,
          observedAt: typeof body?.observedAt === 'string' ? body.observedAt : undefined,
          sourceUrl: typeof body?.sourceUrl === 'string' ? body.sourceUrl : undefined,
          sourceLabel: typeof body?.sourceLabel === 'string' ? body.sourceLabel : undefined,
          publishedAt: typeof body?.publishedAt === 'string' ? body.publishedAt : undefined,
          sourceCategory: typeof body?.sourceCategory === 'string' ? body.sourceCategory : undefined,
          linkedEntityRefs: Array.isArray(body?.linkedEntityRefs) ? body.linkedEntityRefs as OrchestratePipelineRequest['linkedEntityRefs'] : undefined,
          normalizedGcsUri: typeof body?.normalizedGcsUri === 'string' ? body.normalizedGcsUri : undefined,
        },
        config,
      );
      return reply.send(result);
    } catch (err) {
      request.log.error({ err }, 'orchestratePipeline failed');
      const message = err instanceof Error ? err.message : 'unknown_error';
      return reply.code(500).send({ ok: false, error: message });
    }
  });

  app.post<{ Body: unknown }>('/internal/send-test-alert-email', async (request, reply) => {
    if (config.intelInternalSecret !== null) {
      const provided = request.headers['x-signal-intel-secret'];
      if (provided !== config.intelInternalSecret) {
        return reply.code(401).send({ ok: false, error: 'unauthorized' });
      }
    }

    if (!config.resendEnabled) {
      return reply.send({ ok: true, status: 'skipped', message: 'resend_disabled' });
    }

    const body = request.body as {
      workspaceId?: string;
      signalId?: string;
      to?: string[];
      userName?: string;
    } | null;
    const workspaceId = body?.workspaceId ?? config.defaultWorkspaceId;
    const signalId = body?.signalId;
    const to = body?.to;
    if (!workspaceId || !signalId || !to?.length) {
      return reply.code(400).send({ ok: false, error: 'workspace_id, signal_id, to required' });
    }

    try {
      const signalSnap = await db
        .collection('workspaces')
        .doc(workspaceId)
        .collection('signalsLatest')
        .doc(signalId)
        .get();
      if (!signalSnap.exists) {
        return reply.send({ ok: true, status: 'failed', message: 'signal_not_found' });
      }
      const { LatestSignalDocumentSchema } = await import('@signal/contracts');
      const { coerceFirestoreTimestamps } = await import('./lib/coerce-firestore-dates');
      const parsed = LatestSignalDocumentSchema.safeParse(
        coerceFirestoreTimestamps(signalSnap.data() ?? {}),
      );
      if (!parsed.success) {
        return reply.send({ ok: true, status: 'failed', message: 'signal_parse_failed' });
      }
      const signal = parsed.data;
      const { buildAlertEmailHtml, buildAlertEmailPlainText, buildAlertEmailSubject } =
        await import('./lib/render-alert-email');
      const { sendEmailViaResend } = await import('./lib/resend-adapter');

      const subject = buildAlertEmailSubject({ signalTitle: signal.title });
      const html = buildAlertEmailHtml({
        signalId,
        signalTitle: signal.title,
        signalType: signal.signalType,
        score: Math.round(signal.score),
        detectedAtIso: signal.detectedAt.toISOString(),
        shortSummary: signal.shortSummary ?? undefined,
        sourceUrl: signal.provenance?.sourceUrl,
        sourceLabel: signal.provenance?.sourceLabel,
        matchReason: body.userName ? `Test alert for ${body.userName}` : 'Test alert',
      });
      const text = buildAlertEmailPlainText({
        signalId,
        signalTitle: signal.title,
        signalType: signal.signalType,
        score: Math.round(signal.score),
        detectedAtIso: signal.detectedAt.toISOString(),
        shortSummary: signal.shortSummary ?? undefined,
        sourceUrl: signal.provenance?.sourceUrl,
        sourceLabel: signal.provenance?.sourceLabel,
        matchReason: body.userName ? `Test alert for ${body.userName}` : 'Test alert',
      });

      const sent = await sendEmailViaResend(config, { to, subject, html, text }, {});
      return reply.send({
        ok: true,
        status: sent.ok ? 'sent' : 'failed',
        message: sent.ok ? 'email_sent' : (sent.message ?? 'send_failed'),
      });
    } catch (err) {
      request.log.error({ err }, 'send-test-alert-email failed');
      const message = err instanceof Error ? err.message : 'unknown_error';
      return reply.code(500).send({ ok: false, error: message });
    }
  });

  app.post<{ Body: unknown }>('/internal/trigger-ingest', async (request, reply) => {
    if (config.intelInternalSecret !== null) {
      const provided = request.headers['x-signal-intel-secret'];
      if (provided !== config.intelInternalSecret) {
        return reply.code(401).send({ ok: false, error: 'unauthorized' });
      }
    }

    if (!config.toolIngestBaseUrl) {
      return reply.send({ ok: true, triggered: false, reason: 'ingest_base_url_not_configured' });
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.toolIngestRunOnceSecret) {
        headers['x-signal-ingest-secret'] = config.toolIngestRunOnceSecret;
      }
      const resp = await fetch(`${config.toolIngestBaseUrl}/internal/run-once`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(120_000),
      });
      const json = await resp.json().catch(() => ({}));
      return reply.send({ ok: true, triggered: true, ingestResponse: json });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      request.log.error({ err }, 'trigger-ingest failed');
      return reply.send({ ok: true, triggered: false, reason: msg });
    }
  });

  app.get<{ Params: { signalId: string }; Querystring: { workspaceId?: string } }>(
    '/internal/enrich-signal/:signalId',
    async (request, reply) => {
      if (config.intelInternalSecret !== null) {
        const provided = request.headers['x-signal-intel-secret'];
        if (provided !== config.intelInternalSecret) {
          return reply.code(401).send({ ok: false, error: 'unauthorized' });
        }
      }

      const workspaceId = request.query.workspaceId ?? config.defaultWorkspaceId;
      if (!workspaceId) {
        return reply.code(400).send({ ok: false, error: 'workspace_id required' });
      }

      try {
        const { enrichSignalOnDemand } = await import('./lib/enrich-signal-on-demand');
        const result = await enrichSignalOnDemand(
          { workspaceId, signalId: request.params.signalId },
          config,
        );
        return reply.send({ ok: true, result });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown_error';
        if (message === 'signal_not_found') {
          return reply.code(404).send({ ok: false, error: 'signal_not_found' });
        }
        request.log.error({ err }, 'enrich-signal-on-demand failed');
        return reply.code(500).send({ ok: false, error: message });
      }
    },
  );

  app.post<{ Params: { signalId: string }; Body: unknown }>(
    '/internal/signal-chat/:signalId',
    async (request, reply) => {
      if (config.intelInternalSecret !== null) {
        const provided = request.headers['x-signal-intel-secret'];
        if (provided !== config.intelInternalSecret) {
          return reply.code(401).send({ ok: false, error: 'unauthorized' });
        }
      }

      const body = request.body as Record<string, unknown> | null;
      const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : config.defaultWorkspaceId;
      if (!workspaceId) {
        return reply.code(400).send({ ok: false, error: 'workspace_id required' });
      }
      const message = typeof body?.message === 'string' ? body.message : '';
      if (!message) {
        return reply.code(400).send({ ok: false, error: 'message required' });
      }

      try {
        const { handleSignalChat } = await import('./lib/signal-chat');
        const result = await handleSignalChat(
          {
            workspaceId,
            signalId: request.params.signalId,
            message,
            history: Array.isArray(body?.history) ? body.history as Array<{ role: 'user' | 'model'; text: string }> : undefined,
            provider: body?.provider === 'perplexity' ? 'perplexity' : body?.provider === 'gemini' ? 'gemini' : undefined,
          },
          config,
        );
        return reply.send({ ok: true, result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown_error';
        if (msg === 'signal_not_found') {
          return reply.code(404).send({ ok: false, error: 'signal_not_found' });
        }
        request.log.error({ err }, 'signal-chat failed');
        return reply.code(500).send({ ok: false, error: msg });
      }
    },
  );

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  function shutdown() {
    app.log.info('Shutting down');
    app.close().then(() => process.exit(0));
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start();
