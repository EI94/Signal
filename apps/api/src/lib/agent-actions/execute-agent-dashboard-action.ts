import type { BigQuery } from '@google-cloud/bigquery';
import type { ApiRuntimeConfig } from '@signal/config';
import {
  AGENT_DASHBOARD_ACTION_DESCRIPTORS,
  type AgentDashboardActionExecuteResponse,
  type AgentDashboardNextContext,
  type ExposedToolName,
  type ParsedAgentDashboardActionInput,
} from '@signal/contracts';
import { invokeViaMcpReadyAdapter } from '../tool-exposure/mcp-ready-adapter';
import { buildEntityDashboardRoute, buildSignalsDashboardRoute } from './dashboard-routes';

function descriptorLayerKind(action: ParsedAgentDashboardActionInput['action']) {
  const d = AGENT_DASHBOARD_ACTION_DESCRIPTORS.find((x) => x.name === action);
  if (!d) {
    throw new Error(`agent_actions: missing descriptor for ${action}`);
  }
  return d.layerKind;
}

function toExposedTool(parsed: ParsedAgentDashboardActionInput): ExposedToolName {
  switch (parsed.action) {
    case 'brief.create':
      return 'brief.generate';
    case 'brief.send_email':
      return 'brief.send_email';
    case 'alerts.evaluate':
      return 'alerts.evaluate';
    case 'alerts.send_email':
      return 'alerts.send_email';
    case 'context.open_board':
      return 'board_summary.get';
    case 'context.open_signals':
      return 'signals_feed.get';
    case 'context.open_entity':
      return 'entity_context.get';
  }
}

function nextContextAfterSuccess(
  parsed: ParsedAgentDashboardActionInput,
): AgentDashboardNextContext | undefined {
  switch (parsed.action) {
    case 'brief.create':
      return { route: '/', label: 'Board' };
    case 'brief.send_email':
      return { route: '/', label: 'Board' };
    case 'alerts.evaluate':
      return { route: '/notifications', label: 'Notifications' };
    case 'alerts.send_email':
      return { route: '/signals', label: 'Signals' };
    case 'context.open_board':
      return { route: '/', label: 'Board' };
    case 'context.open_signals':
      return {
        route: buildSignalsDashboardRoute(parsed.input),
        label: 'Signals',
      };
    case 'context.open_entity':
      return {
        route: buildEntityDashboardRoute(parsed.input.entityType, parsed.input.entityId),
        label: 'Entity',
      };
  }
}

/**
 * WS11.3 — One product action → same validation + execution as exposed tools (`invokeViaMcpReadyAdapter`).
 */
export async function executeAgentDashboardAction(params: {
  readonly config: ApiRuntimeConfig;
  readonly bigquery: BigQuery | null;
  readonly workspaceId: string;
  readonly parsed: ParsedAgentDashboardActionInput;
  readonly correlationId?: string;
}): Promise<AgentDashboardActionExecuteResponse> {
  const { config, bigquery, workspaceId, parsed, correlationId } = params;
  const tool = toExposedTool(parsed);
  const rawInput = parsed.input as unknown;

  const exec = await invokeViaMcpReadyAdapter({
    config,
    bigquery,
    workspaceId,
    tool,
    rawInput,
    correlationId,
  });

  const layerKind = descriptorLayerKind(parsed.action);

  if (!exec.ok) {
    return {
      ok: false,
      action: parsed.action,
      code: exec.code,
      message: exec.message,
      ...(exec.details !== undefined ? { details: exec.details } : {}),
    };
  }

  return {
    ok: true,
    action: parsed.action,
    layerKind,
    result: exec.output,
    nextContext: nextContextAfterSuccess(parsed),
  };
}
