/**
 * services/ingest — Source fetching, archiving, and delta detection.
 *
 * WS4.2: sequential fetch loop + operational Firestore updates. No GCS/BQ yet.
 * See docs/architecture/fetch-pipeline-v1.md
 */

import { loadIngestRuntimeConfig } from '@signal/config';
import type { HealthResponse, IngestRunOnceResponse } from '@signal/contracts';
import { IngestInternalRunOnceBodyV1Schema } from '@signal/contracts';
import Fastify from 'fastify';
import { getFirestoreDb, initFirebaseAdmin } from './lib/firebase-admin';
import { runOnceIngestCycle } from './lib/run-once';

const config = loadIngestRuntimeConfig();

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

  app.post<{ Body: unknown }>('/internal/run-once', async (request, reply) => {
    if (config.runOnceSecret !== null) {
      const hdr = request.headers['x-signal-ingest-secret'];
      const provided = typeof hdr === 'string' ? hdr : Array.isArray(hdr) ? hdr[0] : '';
      if (provided !== config.runOnceSecret) {
        return reply.code(401).send({ error: 'unauthorized' });
      }
    }

    const parsedBody = IngestInternalRunOnceBodyV1Schema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return reply.code(400).send({ error: 'invalid_body' });
    }

    const result: IngestRunOnceResponse = await runOnceIngestCycle(db, config, {
      sourceId: parsedBody.data.sourceId,
      orchestrationEcho: {
        correlationId: parsedBody.data.correlationId,
        idempotencyKey: parsedBody.data.idempotencyKey,
        scheduledAt: parsedBody.data.scheduledAt,
      },
    });
    return result;
  });

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
