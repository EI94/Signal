import { loadApiRuntimeConfig } from '@signal/config';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';

function testApiConfig() {
  return loadApiRuntimeConfig({
    NODE_ENV: 'development',
    FIREBASE_PROJECT_ID: 'test-proj',
    SIGNAL_DEFAULT_WORKSPACE_ID: 'ws1',
    PORT: '4000',
    LOG_LEVEL: 'silent',
  } as NodeJS.ProcessEnv);
}

describe('buildApp security baseline', () => {
  const app = buildApp(testApiConfig());

  afterAll(async () => {
    await app.close();
  });

  it('sets X-Request-Id on healthz', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    const rid = res.headers['x-request-id'];
    expect(rid).toBeTruthy();
    expect(typeof rid).toBe('string');
  });

  it('preserves valid inbound X-Request-Id', async () => {
    const id = 'abcd1234-abcd-4bcd-abcd-1234567890ab';
    const res = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': id },
    });
    expect(res.headers['x-request-id']).toBe(id);
  });

  it('returns 401 with requestId in body for unauthenticated /v1/auth/me', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/auth/me' });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe('UNAUTHENTICATED');
    expect(body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('returns 401 for unauthenticated GET /v1/notifications', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/notifications' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for unauthenticated GET /v1/tools', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/tools' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for unauthenticated POST /v1/tools/execute', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/tools/execute',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ tool: 'board_summary.get', input: {} }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for unauthenticated GET /v1/tools/capabilities', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/tools/capabilities' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for unauthenticated GET /v1/actions', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/actions' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for unauthenticated POST /v1/actions/execute', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/actions/execute',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ action: 'context.open_board', input: {} }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('sets security headers on responses', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });
});
