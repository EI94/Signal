import type { BigQuery } from '@google-cloud/bigquery';
import type { ApiRuntimeConfig } from '@signal/config';
import { HealthSummaryV1Schema } from '@signal/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { sendErrorResponse } from '../lib/api-error';
import { getFirestoreDb } from '../lib/firebase-admin';
import { loadHealthSummaryV1 } from '../read-models/health-summary-v1';

type HealthInternalOpts = {
  config: ApiRuntimeConfig;
  bigquery: BigQuery | null;
};

export const healthInternalRoutes: FastifyPluginAsync<HealthInternalOpts> = async (app, opts) => {
  const { config, bigquery } = opts;

  app.get('/internal/health/summary', async (request, reply) => {
    const secret = config.internalHealthSecret;
    if (secret !== null) {
      const h = request.headers['x-signal-internal-health-secret'];
      const provided = typeof h === 'string' ? h : Array.isArray(h) ? h[0] : '';
      if (provided !== secret) {
        await sendErrorResponse(
          reply,
          request,
          401,
          'UNAUTHORIZED',
          'invalid or missing health secret',
        );
        return;
      }
    }

    const summary = await loadHealthSummaryV1({
      config,
      bigquery,
      db: getFirestoreDb(),
    });
    const parsed = HealthSummaryV1Schema.safeParse(summary);
    if (!parsed.success) {
      request.log.error({ issues: parsed.error.flatten() }, 'health_summary_contract_failed');
      await sendErrorResponse(reply, request, 500, 'INTERNAL', 'health summary validation failed');
      return;
    }
    return parsed.data;
  });
};
