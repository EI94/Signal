/**
 * WS10.3 — smoke for GET /internal/health/summary using real `loadHealthSummaryV1` + mocked Firestore (no ADC).
 */
import { loadApiRuntimeConfig } from '@signal/config';
import type { FastifyInstance } from 'fastify';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app';

function mockFirestoreForHealthEmptyWorkspace() {
  const emptySnap = { docs: [] as { data: () => unknown }[] };
  const workspaceDoc = {
    get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
    collection: (sub: string) => {
      if (sub === 'signalsLatest' || sub === 'briefs') {
        return {
          orderBy: () => ({
            limit: () => ({
              get: vi.fn().mockResolvedValue(emptySnap),
            }),
          }),
        };
      }
      return {};
    },
  };
  return {
    collection: (name: string) => {
      if (name === 'workspaces') {
        return {
          doc: () => workspaceDoc,
        };
      }
      return {};
    },
  };
}

vi.mock('../lib/firebase-admin', () => ({
  initFirebaseAdmin: vi.fn(),
  getFirebaseAuth: () => ({
    verifyIdToken: vi.fn(),
  }),
  getFirestoreDb: vi.fn(() => mockFirestoreForHealthEmptyWorkspace()),
}));

function testConfig() {
  return loadApiRuntimeConfig({
    NODE_ENV: 'development',
    FIREBASE_PROJECT_ID: 'test-proj',
    SIGNAL_DEFAULT_WORKSPACE_ID: 'ws1',
    PORT: '4000',
    LOG_LEVEL: 'silent',
  } as NodeJS.ProcessEnv);
}

describe('GET /internal/health/summary smoke', () => {
  const app: FastifyInstance = buildApp(testConfig());

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with contract-shaped summary (no BigQuery)', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/health/summary' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      service: string;
      stale: { ingestRun: boolean };
      usageEventsQuery: { attempted: boolean };
    };
    expect(body.service).toBe('api');
    expect(body.usageEventsQuery.attempted).toBe(false);
    expect(typeof body.stale.ingestRun).toBe('boolean');
  });
});
