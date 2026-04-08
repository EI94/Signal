import { loadApiRuntimeConfig } from '@signal/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { invokeViaMcpReadyAdapter } from './mcp-ready-adapter';

const executeMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    ok: true,
    tool: 'board_summary.get',
    kind: 'read',
    output: { workspaceId: 'ws1' },
  }),
);

vi.mock('./execute-exposed-tool', () => ({
  executeExposedTool: executeMock,
}));

function apiCfg() {
  return loadApiRuntimeConfig({
    NODE_ENV: 'development',
    FIREBASE_PROJECT_ID: 'test-proj',
    SIGNAL_DEFAULT_WORKSPACE_ID: 'ws1',
    PORT: '4000',
    LOG_LEVEL: 'silent',
  } as NodeJS.ProcessEnv);
}

describe('invokeViaMcpReadyAdapter', () => {
  afterEach(() => {
    executeMock.mockClear();
  });

  it('returns VALIDATION_ERROR without calling execute when input is invalid', async () => {
    const r = await invokeViaMcpReadyAdapter({
      config: apiCfg(),
      bigquery: null,
      workspaceId: 'ws1',
      tool: 'entity_context.get',
      rawInput: { entityType: 'x' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('VALIDATION_ERROR');
      expect(r.message).toBe('invalid_tool_input');
    }
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('delegates to executeExposedTool after parseExposedToolInput succeeds', async () => {
    const r = await invokeViaMcpReadyAdapter({
      config: apiCfg(),
      bigquery: null,
      workspaceId: 'ws1',
      tool: 'board_summary.get',
      rawInput: {},
    });
    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
  });
});
