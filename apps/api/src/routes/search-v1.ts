import type { ApiRuntimeConfig } from '@signal/config';
import type { LatestSignalDocument } from '@signal/contracts';
import { SearchQueryV1Schema, SearchV1ResponseSchema } from '@signal/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { sendErrorResponse } from '../lib/api-error';
import { getFirestoreDb } from '../lib/firebase-admin';
import { optionalVerifyAuth } from '../plugins/auth';
import { createResolveWorkspacePublicOrMember } from '../plugins/workspace';
import { buildGeographyEntityIndex } from '../read-models/geography-index';
import { buildSearchReadModel } from '../read-models/search-read-model';
import { extractSearchToken, loadSignalsBySearchToken } from '../read-models/search-token-query';
import { loadLatestSignalsWindow, SIGNALS_LATEST_WINDOW_MAX } from '../read-models/signals-window';

export const searchV1Routes: FastifyPluginAsync<{
  config: ApiRuntimeConfig;
}> = async (app, opts) => {
  const { config } = opts;
  const resolvePublicOrMember = createResolveWorkspacePublicOrMember(config);
  const prePublicRead = [optionalVerifyAuth, resolvePublicOrMember] as const;

  app.get('/search', { preHandler: [...prePublicRead] }, async (request, reply) => {
    const wc = request.workspaceContext;
    if (!wc) {
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Workspace context missing');
      return;
    }
    const q = SearchQueryV1Schema.safeParse(request.query);
    if (!q.success) {
      await sendErrorResponse(reply, request, 400, 'BAD_REQUEST', 'Invalid query parameters');
      return;
    }

    const db = getFirestoreDb();
    const geoIndex = await buildGeographyEntityIndex(db, wc.id);

    const token = extractSearchToken(q.data.q);
    let scope: 'live_window' | 'token_index' = 'live_window';
    let docs: LatestSignalDocument[] | null = null;

    if (token) {
      try {
        const tokenResults = await loadSignalsBySearchToken(db, wc.id, token);
        if (tokenResults.length > 0) {
          docs = tokenResults;
          scope = 'token_index';
        }
      } catch (err) {
        request.log.warn({ err, token }, 'token search failed, falling back to window scan');
      }
    }

    if (!docs) {
      docs = await loadLatestSignalsWindow(db, wc.id);
    }

    const body = buildSearchReadModel({
      window: docs,
      query: q.data.q,
      windowHours: q.data.windowHours,
      limit: q.data.limit,
      geoIndex,
      windowMax: SIGNALS_LATEST_WINDOW_MAX,
      scope,
    });

    const parsed = SearchV1ResponseSchema.safeParse(body);
    if (!parsed.success) {
      request.log.error({ issues: parsed.error.flatten() }, 'search response validation failed');
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'Response validation failed');
      return;
    }
    return parsed.data;
  });
};
