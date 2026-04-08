import type { ApiRuntimeConfig } from '@signal/config';
import {
  type FullPreferencesPayload,
  FullPreferencesPayloadSchema,
  GetPreferencesResponseSchema,
  NotificationPreferencesSchema,
  SavePreferencesRequestSchema,
  SavePreferencesResponseSchema,
  TestDeliveryCTAResponseSchema,
} from '@signal/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { sendErrorResponse } from '../lib/api-error';
import { getCloudRunAuthorizationHeader } from '../lib/cloud-run-id-token';
import { getFirestoreDb } from '../lib/firebase-admin';
import { workspaceMemberPreferencesPath } from '../lib/firestore/paths';
import { requireAuth } from '../plugins/auth';
import { createResolveWorkspaceMembership } from '../plugins/workspace';
import { loadLatestSignalsWindow } from '../read-models/signals-window';

const DEFAULT_PREFS: FullPreferencesPayload = {
  notifications: { emailAlerts: true, emailBriefs: true },
  digest: { enabled: true, deliveryTime: '08:00', timezone: 'Europe/Rome' },
  channels: { email: true, whatsapp: false },
  alerting: {
    enabled: false,
    watchedEntityRefs: [],
    watchedCountryCodes: [],
    watchedSignalFamilies: [],
    minImportanceScore: 50,
    cadenceMode: 'both',
  },
};

async function postIntel(
  config: ApiRuntimeConfig,
  path: string,
  body: unknown,
): Promise<{ ok: boolean; json: unknown }> {
  if (!config.toolIntelBaseUrl) {
    return { ok: false, json: { error: 'intel_base_unconfigured' } };
  }
  const url = `${config.toolIntelBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (config.toolIntelSecret) {
    headers['x-signal-intel-secret'] = config.toolIntelSecret;
  }
  const authz = await getCloudRunAuthorizationHeader(config.toolIntelBaseUrl);
  if (authz) headers.authorization = authz;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, json };
}

export const preferencesV1Routes: FastifyPluginAsync<{
  config: ApiRuntimeConfig;
}> = async (app, opts) => {
  const { config } = opts;
  const resolveWorkspace = createResolveWorkspaceMembership(config);
  const preAuth = [requireAuth, resolveWorkspace] as const;

  app.get('/me/preferences', { preHandler: [...preAuth] }, async (request, reply) => {
    const wc = request.workspaceContext;
    const uid = request.authUser?.uid;
    if (!wc || !uid) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Missing context');
      return;
    }
    const db = getFirestoreDb();
    const docRef = db.doc(workspaceMemberPreferencesPath(wc.id, uid));
    const snap = await docRef.get();

    let prefs: FullPreferencesPayload;
    if (snap.exists) {
      const raw = snap.data() ?? {};
      const notifications =
        NotificationPreferencesSchema.safeParse(raw.notifications).data ??
        DEFAULT_PREFS.notifications;
      const full = FullPreferencesPayloadSchema.safeParse({ ...raw, notifications });
      prefs = full.success ? full.data : { ...DEFAULT_PREFS, notifications };
    } else {
      prefs = DEFAULT_PREFS;
    }

    const body = { preferences: prefs };
    const parsed = GetPreferencesResponseSchema.safeParse(body);
    if (!parsed.success) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
      return;
    }
    return parsed.data;
  });

  app.post('/me/preferences', { preHandler: [...preAuth] }, async (request, reply) => {
    const wc = request.workspaceContext;
    const uid = request.authUser?.uid;
    if (!wc || !uid) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Missing context');
      return;
    }
    const parsed = SavePreferencesRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid request body');
      return;
    }
    const db = getFirestoreDb();
    const docRef = db.doc(workspaceMemberPreferencesPath(wc.id, uid));
    await docRef.set({ ...parsed.data.preferences, updatedAt: new Date() }, { merge: true });

    const body = { preferences: parsed.data.preferences };
    const out = SavePreferencesResponseSchema.safeParse(body);
    if (!out.success) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
      return;
    }
    return out.data;
  });

  app.post('/me/test-alert', { preHandler: [...preAuth] }, async (request, reply) => {
    const wc = request.workspaceContext;
    const uid = request.authUser?.uid;
    const email = request.authUser?.email;
    if (!wc || !uid || !email) {
      await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Auth context required');
      return;
    }

    const db = getFirestoreDb();
    const signals = await loadLatestSignalsWindow(db, wc.id);
    if (signals.length === 0) {
      const body = { status: 'skipped' as const, message: 'No signals available' };
      return TestDeliveryCTAResponseSchema.parse(body);
    }

    const topSignal = signals[0];
    if (!topSignal) {
      const body = { status: 'skipped' as const, message: 'No signals available' };
      return TestDeliveryCTAResponseSchema.parse(body);
    }
    const intel = await postIntel(config, '/internal/send-test-alert-email', {
      workspaceId: wc.id,
      signalId: topSignal.signalId,
      to: [email],
      userName: request.authUser?.displayName ?? email,
    });

    const payload = intel.json as { status?: string; message?: string } | null;
    const body = {
      status: (payload?.status === 'sent' ? 'sent' : 'failed') as 'sent' | 'failed',
      message: payload?.message ?? (intel.ok ? undefined : 'Intel service call failed'),
    };
    return TestDeliveryCTAResponseSchema.parse(body);
  });

  app.post('/me/test-digest', { preHandler: [...preAuth] }, async (request, reply) => {
    const wc = request.workspaceContext;
    const uid = request.authUser?.uid;
    const email = request.authUser?.email;
    if (!wc || !uid || !email) {
      await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Auth context required');
      return;
    }

    const genResult = await postIntel(config, '/internal/generate-brief', {
      workspaceId: wc.id,
      briefType: 'daily_workspace',
    });

    const genPayload = genResult.json as { ok?: boolean; result?: { briefId?: string } } | null;
    const briefId = genPayload?.result?.briefId;
    if (!genResult.ok || !briefId) {
      const body = {
        status: 'failed' as const,
        message: 'Brief generation failed or not configured',
      };
      return TestDeliveryCTAResponseSchema.parse(body);
    }

    const sendResult = await postIntel(config, '/internal/send-brief-email', {
      workspaceId: wc.id,
      briefId,
      to: [email],
    });

    const sendPayload = sendResult.json as { ok?: boolean; result?: { status?: string } } | null;
    const status = sendPayload?.result?.status === 'sent' ? 'sent' : 'failed';
    const body = {
      status: status as 'sent' | 'failed',
      message:
        status === 'sent'
          ? `Digest sent to ${email}`
          : (sendPayload?.result?.status ?? 'send_failed'),
    };
    return TestDeliveryCTAResponseSchema.parse(body);
  });
};
