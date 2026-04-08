/**
 * WS10.3 — fast smoke: authenticated serving routes return contract-valid JSON without real Firestore/BQ.
 * I/O is mocked at repository/read-model boundaries used by serving-v1.
 */
import { loadApiRuntimeConfig } from '@signal/config';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app';

vi.mock('../lib/firebase-admin', () => ({
  initFirebaseAdmin: vi.fn(),
  getFirebaseAuth: () => ({
    verifyIdToken: vi.fn().mockResolvedValue({
      uid: 'user-1',
      email: 'u@test.com',
      email_verified: true,
      name: 'User',
      picture: null,
      firebase: { sign_in_provider: 'password' },
    }),
  }),
  getFirestoreDb: vi.fn(() => ({})),
}));

vi.mock('../repositories/workspace-repository', () => ({
  resolveWorkspaceMembership: vi.fn().mockResolvedValue({
    ok: true,
    workspace: { id: 'ws1', name: 'WS', slug: null },
    role: 'admin',
  }),
  loadWorkspaceRootContext: vi.fn().mockResolvedValue({ id: 'ws1', name: 'WS', slug: null }),
}));

vi.mock('../read-models/signals-window', () => ({
  loadLatestSignalsWindow: vi.fn().mockResolvedValue([]),
}));

vi.mock('../read-models/geography-index', () => ({
  buildGeographyEntityIndex: vi.fn().mockResolvedValue({
    entityIdToIso2: new Map(),
    orgHqCountry: new Map(),
  }),
}));

vi.mock('../read-models/notifications-list', () => ({
  buildNotificationsListReadModel: vi.fn().mockResolvedValue({
    workspaceId: 'ws1',
    items: [],
    nextPageToken: null,
  }),
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

describe('serving v1 smoke', () => {
  const app = buildApp(testConfig());

  afterAll(async () => {
    await app.close();
  });

  const auth = { authorization: 'Bearer test-token' };

  it('GET /v1/board/summary returns 200 and workspaceId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/board/summary',
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { workspaceId: string; topSignals: unknown[] };
    expect(body.workspaceId).toBe('ws1');
    expect(Array.isArray(body.topSignals)).toBe(true);
  });

  it('GET /v1/board/summary without auth returns 200 (public read)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/board/summary',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { workspaceId: string; topSignals: unknown[] };
    expect(body.workspaceId).toBe('ws1');
  });

  it('GET /v1/signals returns 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/signals?limit=10',
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { workspaceId: string; items: unknown[] };
    expect(body.workspaceId).toBe('ws1');
  });

  it('GET /v1/entities/:entityType/:entityId returns 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/entities/company/acme-corp',
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { entity: { entityType: string; entityId: string } };
    expect(body.entity.entityType).toBe('company');
    expect(body.entity.entityId).toBe('acme-corp');
  });

  it('GET /v1/map/signals returns 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/map/signals',
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { points: unknown[] };
    expect(Array.isArray(body.points)).toBe(true);
  });

  it('GET /v1/notifications returns 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/notifications',
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });
});
