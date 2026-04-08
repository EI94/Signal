import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMapSignalsUrl, fetchMapSignals, MapSignalsFetchError } from './fetch-map-signals';

const API = 'http://localhost:4000';
const TOKEN = 'test-token';

describe('buildMapSignalsUrl', () => {
  it('builds base URL with default limit', () => {
    const url = buildMapSignalsUrl(API, {});
    expect(url).toBe(`${API}/v1/map/signals?limit=100`);
  });

  it('includes signalType and minScore', () => {
    const url = buildMapSignalsUrl(API, { signalType: 'project_award', minScore: 60 });
    expect(url).toContain('signalType=project_award');
    expect(url).toContain('minScore=60');
  });

  it('omits minScore when 0 or unset', () => {
    expect(buildMapSignalsUrl(API, { minScore: 0 })).not.toContain('minScore');
    expect(buildMapSignalsUrl(API, {})).not.toContain('minScore');
  });

  it('includes cursor', () => {
    expect(buildMapSignalsUrl(API, {}, 'off-5')).toContain('cursor=off-5');
  });
});

const VALID: Record<string, unknown> = {
  workspaceId: 'ws-1',
  points: [
    {
      signalId: 's1',
      signalType: 'project_award',
      title: 'T',
      status: 'active',
      occurredAt: '2026-04-01T10:00:00.000Z',
      detectedAt: '2026-04-01T12:00:00.000Z',
      regionKey: 'org:x',
    },
  ],
  nextPageToken: null,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('fetchMapSignals', () => {
  it('returns JSON on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(VALID), { status: 200 }),
    );
    const r = await fetchMapSignals(API, TOKEN, {});
    expect(r.workspaceId).toBe('ws-1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/map/signals'),
      expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } }),
    );
  });

  it('throws MapSignalsFetchError on error body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Nope' } }), { status: 403 }),
    );
    try {
      await fetchMapSignals(API, TOKEN, {});
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(MapSignalsFetchError);
      expect((e as MapSignalsFetchError).message).toBe('Nope');
      expect((e as MapSignalsFetchError).statusCode).toBe(403);
    }
  });
});
