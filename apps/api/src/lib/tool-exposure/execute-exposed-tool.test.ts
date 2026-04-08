import { loadApiRuntimeConfig } from '@signal/config';
import type { ParsedExposedToolInput } from '@signal/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeExposedTool } from './execute-exposed-tool';

const loadWin = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('../../read-models/signals-window', () => ({
  loadLatestSignalsWindow: loadWin,
}));

vi.mock('../firebase-admin', () => ({
  getFirestoreDb: vi.fn(() => ({})),
}));

function apiCfg(over: Record<string, string | undefined> = {}) {
  return loadApiRuntimeConfig({
    NODE_ENV: 'development',
    FIREBASE_PROJECT_ID: 'test-proj',
    SIGNAL_DEFAULT_WORKSPACE_ID: 'ws1',
    PORT: '4000',
    LOG_LEVEL: 'silent',
    ...over,
  } as NodeJS.ProcessEnv);
}

describe('executeExposedTool', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    loadWin.mockClear();
  });

  it('returns board summary read output', async () => {
    const parsed: ParsedExposedToolInput = { tool: 'board_summary.get', input: {} };
    const r = await executeExposedTool({
      config: apiCfg(),
      bigquery: null,
      workspaceId: 'ws1',
      parsed,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tool).toBe('board_summary.get');
      expect(r.kind).toBe('read');
      expect((r.output as { workspaceId: string }).workspaceId).toBe('ws1');
    }
  });

  it('returns UNAVAILABLE for action tool when intel base URL unset', async () => {
    const parsed: ParsedExposedToolInput = {
      tool: 'brief.generate',
      input: { briefType: 'daily_workspace' },
    };
    const r = await executeExposedTool({
      config: apiCfg(),
      bigquery: null,
      workspaceId: 'ws1',
      parsed,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('UNAVAILABLE');
    }
  });

  it('proxies source.fetch to intel tools/execute when configured', async () => {
    const ingestSummary = {
      processed: 1,
      unchanged: 1,
      changed: 0,
      firstSeen: 0,
      failed: 0,
      skipped: 0,
      archived: 0,
      persisted: 0,
      persistSkipped: 0,
      persistFailed: 0,
      published: 0,
      publishFailed: 0,
      publishSkipped: 0,
      skippedRatePolicy: 0,
      maxSourcesPerRunApplied: null,
      sourcesOmittedByCap: 0,
    };
    const fetchMock = vi.fn(
      async (): Promise<Response> =>
        new Response(
          JSON.stringify({
            status: 'success',
            tool: 'fetch_source',
            output: {
              ok: true,
              runAt: '2026-04-05T12:00:00.000Z',
              summary: ingestSummary,
            },
            durationMs: 1,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const parsed: ParsedExposedToolInput = {
      tool: 'source.fetch',
      input: { sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
    };
    const r = await executeExposedTool({
      config: apiCfg({ SIGNAL_TOOL_INTEL_BASE_URL: 'http://intel.test' }),
      bigquery: null,
      workspaceId: 'ws1',
      parsed,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tool).toBe('source.fetch');
      expect(r.kind).toBe('action');
      expect(fetchMock).toHaveBeenCalled();
    }
  });
});
