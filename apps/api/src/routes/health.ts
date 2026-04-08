import type { ApiRuntimeConfig } from '@signal/config';
import type { HealthResponse } from '@signal/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { getFirestoreDb } from '../lib/firebase-admin';

type HealthOpts = {
  config: ApiRuntimeConfig;
};

export const healthRoutes: FastifyPluginAsync<HealthOpts> = async (app, opts) => {
  const { config } = opts;

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
      await getFirestoreDb().collection('workspaces').doc(config.defaultWorkspaceId).get();
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
};
