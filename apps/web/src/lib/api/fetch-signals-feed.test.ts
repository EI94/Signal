import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSignalsFeedUrl, fetchSignalsFeed, SignalsFeedFetchError } from './fetch-signals-feed';

const API = 'http://localhost:4000';
const TOKEN = 'test-token';

describe('buildSignalsFeedUrl', () => {
  it('builds base URL with default limit and includeFacets', () => {
    const url = buildSignalsFeedUrl(API, {});
    expect(url).toBe(`${API}/v1/signals?limit=25&includeFacets=true`);
  });

  it('includes signalType filter', () => {
    const url = buildSignalsFeedUrl(API, { signalType: 'ma_divestment' });
    expect(url).toContain('signalType=ma_divestment');
  });

  it('includes sort parameter', () => {
    const url = buildSignalsFeedUrl(API, { sort: 'score_desc' });
    expect(url).toContain('sort=score_desc');
  });

  it('includes minScore when > 0', () => {
    const url = buildSignalsFeedUrl(API, { minScore: 50 });
    expect(url).toContain('minScore=50');
  });

  it('omits minScore when 0 or undefined', () => {
    expect(buildSignalsFeedUrl(API, { minScore: 0 })).not.toContain('minScore');
    expect(buildSignalsFeedUrl(API, {})).not.toContain('minScore');
  });

  it('includes cursor when provided', () => {
    const url = buildSignalsFeedUrl(API, {}, 'abc123');
    expect(url).toContain('cursor=abc123');
  });

  it('omits cursor when null or undefined', () => {
    expect(buildSignalsFeedUrl(API, {}, null)).not.toContain('cursor');
    expect(buildSignalsFeedUrl(API, {})).not.toContain('cursor');
  });

  it('uses custom limit', () => {
    const url = buildSignalsFeedUrl(API, {}, null, 10);
    expect(url).toContain('limit=10');
  });
});

const VALID_RESPONSE = {
  workspaceId: 'ws-1',
  items: [
    {
      signalId: 'sig-1',
      signalType: 'project_award',
      title: 'Test signal',
      shortSummary: null,
      status: 'active',
      novelty: 'new',
      compositeScore: 80,
      occurredAt: '2026-04-01T10:00:00.000Z',
      detectedAt: '2026-04-01T12:00:00.000Z',
    },
  ],
  nextPageToken: 'cursor-page-2',
  facets: {
    signalTypes: [{ value: 'project_award', count: 1 }],
    statuses: [{ value: 'active', count: 1 }],
    novelties: [{ value: 'new', count: 1 }],
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('fetchSignalsFeed', () => {
  it('returns parsed response on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }),
    );

    const result = await fetchSignalsFeed(API, TOKEN, {});
    expect(result).toEqual(VALID_RESPONSE);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`${API}/v1/signals`),
      expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } }),
    );
  });

  it('throws SignalsFeedFetchError with API error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Forbidden' } }), { status: 403 }),
    );

    try {
      await fetchSignalsFeed(API, TOKEN, {});
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SignalsFeedFetchError);
      expect((e as SignalsFeedFetchError).message).toBe('Forbidden');
      expect((e as SignalsFeedFetchError).statusCode).toBe(403);
    }
  });

  it('falls back to HTTP status when body is unparseable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('bad', { status: 500 }));

    try {
      await fetchSignalsFeed(API, TOKEN, {});
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SignalsFeedFetchError);
      expect((e as SignalsFeedFetchError).message).toBe('HTTP 500');
    }
  });
});
