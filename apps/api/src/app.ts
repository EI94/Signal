import cors from '@fastify/cors';
import type { ApiRuntimeConfig } from '@signal/config';
import Fastify from 'fastify';
import { createBigQueryClientWhenConfigured } from './lib/bigquery/client';
import { buildCorsOriginChecker } from './lib/cors-origin-checker';
import { getOrCreateRequestId } from './lib/request-id';
import { agentActionsV1Routes } from './routes/agent-actions-v1';
import { authV1Routes } from './routes/auth';
import { healthRoutes } from './routes/health';
import { healthInternalRoutes } from './routes/health-internal';
import { marketV1Routes } from './routes/market-v1';
import { preferencesV1Routes } from './routes/preferences-v1';
import { pulseV1Routes } from './routes/pulse-v1';
import { searchV1Routes } from './routes/search-v1';
import { servingV1Routes } from './routes/serving-v1';
import { toolExposureV1Routes } from './routes/tool-exposure-v1';
import { watchlistsV1Routes } from './routes/watchlists-v1';

export function buildApp(config: ApiRuntimeConfig) {
  const bigquery = createBigQueryClientWhenConfigured(config);

  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
    genReqId: (req) => getOrCreateRequestId(req.headers['x-request-id']),
  });

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Request-Id', request.id);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header(
      'Permissions-Policy',
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
    );
    return payload;
  });

  app.register(cors, {
    origin: buildCorsOriginChecker(config.corsOrigins),
    credentials: true,
    methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Signal-Workspace-Id', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });

  app.register(healthRoutes, { config });
  app.register(healthInternalRoutes, { config, bigquery });
  app.register(authV1Routes, { prefix: '/v1/auth', config });
  app.register(servingV1Routes, {
    prefix: '/v1',
    config,
    bigquery,
  });
  app.register(pulseV1Routes, { prefix: '/v1', config });
  app.register(searchV1Routes, { prefix: '/v1', config });
  app.register(marketV1Routes, { prefix: '/v1', config });
  app.register(preferencesV1Routes, { prefix: '/v1', config });
  app.register(watchlistsV1Routes, { prefix: '/v1', config });
  app.register(toolExposureV1Routes, {
    prefix: '/v1',
    config,
    bigquery,
  });
  app.register(agentActionsV1Routes, {
    prefix: '/v1',
    config,
    bigquery,
  });

  return app;
}
