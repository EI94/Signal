import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardSummaryFetchError, fetchBoardSummary } from './fetch-board-summary';

const API_BASE = 'http://localhost:4000';
const TOKEN = 'test-id-token';

const VALID_RESPONSE = {
  workspaceId: 'ws-1',
  generatedAt: '2026-04-05T12:00:00.000Z',
  asOf: '2026-04-05T11:55:00.000Z',
  topSignals: [
    {
      signalId: 'sig-1',
      signalType: 'project_award',
      title: 'ACME wins LNG contract',
      shortSummary: null,
      status: 'active',
      novelty: 'new',
      compositeScore: 82,
      occurredAt: '2026-04-04T10:00:00.000Z',
      detectedAt: '2026-04-04T14:30:00.000Z',
    },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('fetchBoardSummary', () => {
  it('sends Authorization header and returns data on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }),
    );

    const result = await fetchBoardSummary(API_BASE, TOKEN);
    expect(result).toEqual(VALID_RESPONSE);
    expect(globalThis.fetch).toHaveBeenCalledWith(`${API_BASE}/v1/board/summary`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
  });

  it('throws BoardSummaryFetchError with API error message on 403', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Not provisioned' } }), {
        status: 403,
      }),
    );

    try {
      await fetchBoardSummary(API_BASE, TOKEN);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BoardSummaryFetchError);
      expect((e as BoardSummaryFetchError).message).toBe('Not provisioned');
      expect((e as BoardSummaryFetchError).statusCode).toBe(403);
    }
  });

  it('falls back to HTTP status when body has no error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not json', { status: 500 }));

    try {
      await fetchBoardSummary(API_BASE, TOKEN);
    } catch (e) {
      expect(e).toBeInstanceOf(BoardSummaryFetchError);
      expect((e as BoardSummaryFetchError).message).toBe('HTTP 500');
      expect((e as BoardSummaryFetchError).statusCode).toBe(500);
    }
  });

  it('propagates network errors as-is', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(fetchBoardSummary(API_BASE, TOKEN)).rejects.toThrow('Failed to fetch');
  });
});
