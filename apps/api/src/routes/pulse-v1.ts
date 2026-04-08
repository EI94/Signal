import type { ApiRuntimeConfig } from '@signal/config';
import { PulseQueryV1Schema, PulseV1ResponseSchema } from '@signal/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { sendErrorResponse } from '../lib/api-error';
import { getFirestoreDb } from '../lib/firebase-admin';
import { optionalVerifyAuth } from '../plugins/auth';
import { createResolveWorkspacePublicOrMember } from '../plugins/workspace';
import { buildGeographyEntityIndex } from '../read-models/geography-index';
import { buildPulseReadModel } from '../read-models/pulse-read-model';
import { loadLatestSignalsWindow } from '../read-models/signals-window';

const DEFAULT_WINDOW_HOURS = 168;

export const pulseV1Routes: FastifyPluginAsync<{
  config: ApiRuntimeConfig;
}> = async (app, opts) => {
  const { config } = opts;
  const resolvePublicOrMember = createResolveWorkspacePublicOrMember(config);
  const prePublicRead = [optionalVerifyAuth, resolvePublicOrMember] as const;

  app.get('/pulse', { preHandler: [...prePublicRead] }, async (request, reply) => {
    const wc = request.workspaceContext;
    if (!wc) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Workspace context missing');
      return;
    }
    const q = PulseQueryV1Schema.safeParse(request.query);
    if (!q.success) {
      await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid query parameters');
      return;
    }

    const db = getFirestoreDb();
    const [window, geoIndex] = await Promise.all([
      loadLatestSignalsWindow(db, wc.id),
      buildGeographyEntityIndex(db, wc.id),
    ]);

    const body = buildPulseReadModel({
      window,
      windowHours: q.data.windowHours ?? DEFAULT_WINDOW_HOURS,
      geoIndex,
      countryFilter: q.data.country,
    });

    const parsed = PulseV1ResponseSchema.safeParse(body);
    if (!parsed.success) {
      request.log.error({ issues: parsed.error.flatten() }, 'pulse response validation failed');
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
      return;
    }
    return parsed.data;
  });
};
