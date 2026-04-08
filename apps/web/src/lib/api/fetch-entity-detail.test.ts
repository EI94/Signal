import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildEntityDetailUrl,
  EntityDetailFetchError,
  fetchEntityDetail,
} from './fetch-entity-detail';

const API = 'http://localhost:4000';
const TOKEN = 'test-token';

describe('buildEntityDetailUrl', () => {
  it('builds basic URL', () => {
    expect(buildEntityDetailUrl(API, 'competitor', 'acme')).toBe(
      `${API}/v1/entities/competitor/acme`,
    );
  });

  it('encodes special characters', () => {
    expect(buildEntityDetailUrl(API, 'org', 'a/b')).toContain('/v1/entities/org/a%2Fb');
  });

  it('appends timelineLimit', () => {
    const url = buildEntityDetailUrl(API, 'client', 'x', 10);
    expect(url).toContain('timelineLimit=10');
  });
});

const VALID_RESPONSE = {
  workspaceId: 'ws-1',
  entity: { entityType: 'competitor', entityId: 'acme', displayName: 'Acme Corp' },
  recentSignals: [],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('fetchEntityDetail', () => {
  it('returns parsed response on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }),
    );
    const r = await fetchEntityDetail(API, TOKEN, 'competitor', 'acme');
    expect(r.entity.displayName).toBe('Acme Corp');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/entities/competitor/acme'),
      expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } }),
    );
  });

  it('throws EntityDetailFetchError on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 }),
    );
    try {
      await fetchEntityDetail(API, TOKEN, 'competitor', 'gone');
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(EntityDetailFetchError);
      expect((e as EntityDetailFetchError).message).toBe('Not found');
      expect((e as EntityDetailFetchError).statusCode).toBe(404);
    }
  });
});
