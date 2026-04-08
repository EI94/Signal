import { describe, expect, it } from 'vitest';
import {
  AGENT_DASHBOARD_ACTION_DESCRIPTORS,
  AGENT_DASHBOARD_ACTION_NAMES,
  AgentDashboardActionExecuteResponseSchema,
  AgentDashboardActionsListV1ResponseSchema,
  parseAgentDashboardActionInput,
} from '../agent-dashboard-actions';

describe('agent-dashboard-actions (WS11.3)', () => {
  it('lists the same cardinality as action names', () => {
    expect(AGENT_DASHBOARD_ACTION_DESCRIPTORS.length).toBe(AGENT_DASHBOARD_ACTION_NAMES.length);
  });

  it('parses brief.create input', () => {
    const r = parseAgentDashboardActionInput('brief.create', { briefType: 'daily_workspace' });
    expect(r.ok).toBe(true);
    if (r.ok && r.data.action === 'brief.create') {
      expect(r.data.input.briefType).toBe('daily_workspace');
    }
  });

  it('rejects invalid context.open_entity input', () => {
    const r = parseAgentDashboardActionInput('context.open_entity', { entityType: 'x' });
    expect(r.ok).toBe(false);
  });

  it('AgentDashboardActionsListV1ResponseSchema accepts descriptor list', () => {
    const p = AgentDashboardActionsListV1ResponseSchema.safeParse({
      actions: [...AGENT_DASHBOARD_ACTION_DESCRIPTORS],
    });
    expect(p.success).toBe(true);
  });

  it('AgentDashboardActionExecuteResponseSchema accepts success shape', () => {
    const p = AgentDashboardActionExecuteResponseSchema.safeParse({
      ok: true,
      action: 'context.open_board',
      layerKind: 'read_context',
      result: { workspaceId: 'ws' },
      nextContext: { route: '/', label: 'Board' },
    });
    expect(p.success).toBe(true);
  });
});
