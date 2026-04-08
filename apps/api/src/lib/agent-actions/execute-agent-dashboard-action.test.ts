import { loadApiRuntimeConfig } from '@signal/config';
import type { ParsedAgentDashboardActionInput } from '@signal/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeAgentDashboardAction } from './execute-agent-dashboard-action';

const invokeMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    ok: true,
    tool: 'brief.generate',
    kind: 'action',
    output: { briefId: 'b1' },
  }),
);

vi.mock('../tool-exposure/mcp-ready-adapter', () => ({
  invokeViaMcpReadyAdapter: invokeMock,
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

describe('executeAgentDashboardAction', () => {
  afterEach(() => {
    invokeMock.mockClear();
  });

  it('maps brief.create to brief.generate for invoke', async () => {
    const parsed: ParsedAgentDashboardActionInput = {
      action: 'brief.create',
      input: { briefType: 'daily_workspace' },
    };
    const r = await executeAgentDashboardAction({
      config: apiCfg(),
      bigquery: null,
      workspaceId: 'ws1',
      parsed,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action).toBe('brief.create');
      expect(r.layerKind).toBe('effectful');
      expect(r.nextContext?.route).toBe('/');
    }
    expect(invokeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'brief.generate',
        rawInput: { briefType: 'daily_workspace' },
        workspaceId: 'ws1',
      }),
    );
  });

  it('maps context.open_signals to signals_feed.get', async () => {
    const parsed: ParsedAgentDashboardActionInput = {
      action: 'context.open_signals',
      input: { limit: 10, signalType: 'project_award' },
    };
    const r = await executeAgentDashboardAction({
      config: apiCfg(),
      bigquery: null,
      workspaceId: 'ws1',
      parsed,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.nextContext?.route).toContain('/signals');
      expect(r.nextContext?.route).toContain('signalType=project_award');
    }
    expect(invokeMock).toHaveBeenCalledWith(expect.objectContaining({ tool: 'signals_feed.get' }));
  });
});
