import type { BigQuery } from '@google-cloud/bigquery';
import type { ApiRuntimeConfig } from '@signal/config';
import {
  BoardSummaryV1ResponseSchema,
  EntityDetailV1ResponseSchema,
  EvaluateAlertsResponseSchema,
  type ExposedToolName,
  MapSignalsV1ResponseSchema,
  MorningBriefGenerationResultSchema,
  type ParsedExposedToolInput,
  SendEmailDeliveryResponseSchema,
  SignalsFeedV1ResponseSchema,
  SignalToolExecutionResponseSchema,
} from '@signal/contracts';
import { buildBoardSummaryFromWindow } from '../../read-models/board-summary';
import { buildEntityDetailReadModel } from '../../read-models/entity-detail';
import { buildMapSignalsFromWindow } from '../../read-models/map-signals';
import { buildSignalsFeedFromWindow } from '../../read-models/signals-feed';
import { loadLatestSignalsWindow } from '../../read-models/signals-window';
import { getCloudRunAuthorizationHeader } from '../cloud-run-id-token';
import { getFirestoreDb } from '../firebase-admin';

export type ToolExposureExecuteResult =
  | { ok: true; tool: ExposedToolName; kind: 'read' | 'action'; output: unknown }
  | {
      ok: false;
      tool: ExposedToolName;
      code: 'VALIDATION_ERROR' | 'UNAVAILABLE' | 'UPSTREAM_ERROR' | 'INTERNAL';
      message: string;
      details?: unknown;
    };

async function postIntelJson(
  config: ApiRuntimeConfig,
  path: string,
  body: unknown,
): Promise<
  { ok: true; json: unknown } | { ok: false; status: number; message: string; body: unknown }
> {
  if (!config.toolIntelBaseUrl) {
    return { ok: false, status: 503, message: 'tool_intel_base_unconfigured', body: null };
  }
  const url = `${config.toolIntelBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (config.toolIntelSecret) {
    headers['x-signal-intel-secret'] = config.toolIntelSecret;
  }
  const authz = await getCloudRunAuthorizationHeader(config.toolIntelBaseUrl);
  if (authz) {
    headers.authorization = authz;
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    return { ok: false, status: res.status, message: 'intel_response_not_json', body: text };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, message: `intel_http_${res.status}`, body: json };
  }
  return { ok: true, json };
}

/**
 * Dispatches one exposed tool call. Workspace id is always the resolved membership workspace.
 * Read tools use the same read models as GET /v1/*; action tools POST to services/intel when configured.
 */
export async function executeExposedTool(params: {
  readonly config: ApiRuntimeConfig;
  readonly bigquery: BigQuery | null;
  readonly workspaceId: string;
  readonly parsed: ParsedExposedToolInput;
  readonly correlationId?: string;
  readonly idempotencyKey?: string;
}): Promise<ToolExposureExecuteResult> {
  const { config, bigquery, workspaceId, parsed, correlationId, idempotencyKey } = params;
  const db = getFirestoreDb();

  try {
    switch (parsed.tool) {
      case 'board_summary.get': {
        const window = await loadLatestSignalsWindow(db, workspaceId);
        const body = buildBoardSummaryFromWindow(workspaceId, window);
        const v = BoardSummaryV1ResponseSchema.safeParse(body);
        if (!v.success) {
          return {
            ok: false,
            tool: parsed.tool,
            code: 'INTERNAL',
            message: 'response_validation_failed',
            details: v.error.flatten(),
          };
        }
        return { ok: true, tool: parsed.tool, kind: 'read', output: v.data };
      }
      case 'signals_feed.get': {
        const window = await loadLatestSignalsWindow(db, workspaceId);
        const built = buildSignalsFeedFromWindow(window, {
          ...parsed.input,
          workspaceId,
        });
        const body = { workspaceId, ...built };
        const v = SignalsFeedV1ResponseSchema.safeParse(body);
        if (!v.success) {
          return {
            ok: false,
            tool: parsed.tool,
            code: 'INTERNAL',
            message: 'response_validation_failed',
            details: v.error.flatten(),
          };
        }
        return { ok: true, tool: parsed.tool, kind: 'read', output: v.data };
      }
      case 'entity_context.get': {
        const { entityType, entityId, ...query } = parsed.input;
        const body = await buildEntityDetailReadModel({
          config,
          bigquery,
          workspaceId,
          entityType,
          entityId,
          query: { ...query, workspaceId },
        });
        if (!body) {
          return {
            ok: false,
            tool: parsed.tool,
            code: 'UPSTREAM_ERROR',
            message: 'entity_not_found',
          };
        }
        const v = EntityDetailV1ResponseSchema.safeParse(body);
        if (!v.success) {
          return {
            ok: false,
            tool: parsed.tool,
            code: 'INTERNAL',
            message: 'response_validation_failed',
            details: v.error.flatten(),
          };
        }
        return { ok: true, tool: parsed.tool, kind: 'read', output: v.data };
      }
      case 'map_signals.get': {
        const window = await loadLatestSignalsWindow(db, workspaceId);
        const built = buildMapSignalsFromWindow(window, { ...parsed.input, workspaceId });
        const body = {
          workspaceId,
          points: built.points,
          nextPageToken: built.nextPageToken,
        };
        const v = MapSignalsV1ResponseSchema.safeParse(body);
        if (!v.success) {
          return {
            ok: false,
            tool: parsed.tool,
            code: 'INTERNAL',
            message: 'response_validation_failed',
            details: v.error.flatten(),
          };
        }
        return { ok: true, tool: parsed.tool, kind: 'read', output: v.data };
      }
      case 'brief.generate': {
        const intel = await postIntelJson(config, '/internal/generate-brief', {
          ...parsed.input,
          workspaceId,
        });
        if (!intel.ok) {
          if (intel.status === 503 && intel.message === 'tool_intel_base_unconfigured') {
            return {
              ok: false,
              tool: parsed.tool,
              code: 'UNAVAILABLE',
              message:
                'Action tools require SIGNAL_TOOL_INTEL_BASE_URL (and optional SIGNAL_TOOL_INTEL_SECRET) for services/intel.',
              details: intel.body,
            };
          }
          return {
            ok: false,
            tool: parsed.tool,
            code: 'UPSTREAM_ERROR',
            message: intel.message,
            details: intel.body,
          };
        }
        const payload = intel.json as {
          ok?: boolean;
          skipped?: boolean;
          result?: unknown;
          reason?: string;
        };
        if (payload.ok === true && payload.skipped === true) {
          return { ok: true, tool: parsed.tool, kind: 'action', output: payload };
        }
        if (payload.ok === true && payload.result !== undefined) {
          const v = MorningBriefGenerationResultSchema.safeParse(payload.result);
          if (!v.success) {
            return {
              ok: false,
              tool: parsed.tool,
              code: 'UPSTREAM_ERROR',
              message: 'intel_response_shape_mismatch',
              details: v.error.flatten(),
            };
          }
          return { ok: true, tool: parsed.tool, kind: 'action', output: v.data };
        }
        return {
          ok: false,
          tool: parsed.tool,
          code: 'UPSTREAM_ERROR',
          message: 'unexpected_intel_generate_brief_payload',
          details: payload,
        };
      }
      case 'brief.send_email': {
        const intel = await postIntelJson(config, '/internal/send-brief-email', {
          ...parsed.input,
          workspaceId,
        });
        if (!intel.ok) {
          if (intel.status === 503 && intel.message === 'tool_intel_base_unconfigured') {
            return {
              ok: false,
              tool: parsed.tool,
              code: 'UNAVAILABLE',
              message:
                'Action tools require SIGNAL_TOOL_INTEL_BASE_URL (and optional SIGNAL_TOOL_INTEL_SECRET) for services/intel.',
              details: intel.body,
            };
          }
          return {
            ok: false,
            tool: parsed.tool,
            code: 'UPSTREAM_ERROR',
            message: intel.message,
            details: intel.body,
          };
        }
        const payload = intel.json as { ok?: boolean; result?: unknown };
        if (payload.ok === true && payload.result !== undefined) {
          const v = SendEmailDeliveryResponseSchema.safeParse(payload.result);
          if (!v.success) {
            return {
              ok: false,
              tool: parsed.tool,
              code: 'UPSTREAM_ERROR',
              message: 'intel_response_shape_mismatch',
              details: v.error.flatten(),
            };
          }
          return { ok: true, tool: parsed.tool, kind: 'action', output: v.data };
        }
        return {
          ok: false,
          tool: parsed.tool,
          code: 'UPSTREAM_ERROR',
          message: 'unexpected_intel_send_brief_email_payload',
          details: payload,
        };
      }
      case 'alerts.evaluate': {
        const intel = await postIntelJson(config, '/internal/evaluate-alerts', {
          ...parsed.input,
          workspaceId,
        });
        if (!intel.ok) {
          if (intel.status === 503 && intel.message === 'tool_intel_base_unconfigured') {
            return {
              ok: false,
              tool: parsed.tool,
              code: 'UNAVAILABLE',
              message:
                'Action tools require SIGNAL_TOOL_INTEL_BASE_URL (and optional SIGNAL_TOOL_INTEL_SECRET) for services/intel.',
              details: intel.body,
            };
          }
          return {
            ok: false,
            tool: parsed.tool,
            code: 'UPSTREAM_ERROR',
            message: intel.message,
            details: intel.body,
          };
        }
        const payload = intel.json as {
          ok?: boolean;
          skipped?: boolean;
          result?: unknown;
          reason?: string;
        };
        if (payload.ok === true && payload.skipped === true) {
          return { ok: true, tool: parsed.tool, kind: 'action', output: payload };
        }
        if (payload.ok === true && payload.result !== undefined) {
          const v = EvaluateAlertsResponseSchema.safeParse(payload.result);
          if (!v.success) {
            return {
              ok: false,
              tool: parsed.tool,
              code: 'UPSTREAM_ERROR',
              message: 'intel_response_shape_mismatch',
              details: v.error.flatten(),
            };
          }
          return { ok: true, tool: parsed.tool, kind: 'action', output: v.data };
        }
        return {
          ok: false,
          tool: parsed.tool,
          code: 'UPSTREAM_ERROR',
          message: 'unexpected_intel_evaluate_alerts_payload',
          details: payload,
        };
      }
      case 'alerts.send_email': {
        const intel = await postIntelJson(config, '/internal/send-alert-email', {
          ...parsed.input,
          workspaceId,
        });
        if (!intel.ok) {
          if (intel.status === 503 && intel.message === 'tool_intel_base_unconfigured') {
            return {
              ok: false,
              tool: parsed.tool,
              code: 'UNAVAILABLE',
              message:
                'Action tools require SIGNAL_TOOL_INTEL_BASE_URL (and optional SIGNAL_TOOL_INTEL_SECRET) for services/intel.',
              details: intel.body,
            };
          }
          return {
            ok: false,
            tool: parsed.tool,
            code: 'UPSTREAM_ERROR',
            message: intel.message,
            details: intel.body,
          };
        }
        const payload = intel.json as { ok?: boolean; result?: unknown };
        if (payload.ok === true && payload.result !== undefined) {
          const v = SendEmailDeliveryResponseSchema.safeParse(payload.result);
          if (!v.success) {
            return {
              ok: false,
              tool: parsed.tool,
              code: 'UPSTREAM_ERROR',
              message: 'intel_response_shape_mismatch',
              details: v.error.flatten(),
            };
          }
          return { ok: true, tool: parsed.tool, kind: 'action', output: v.data };
        }
        return {
          ok: false,
          tool: parsed.tool,
          code: 'UPSTREAM_ERROR',
          message: 'unexpected_intel_send_alert_email_payload',
          details: payload,
        };
      }
      case 'source.fetch': {
        const intel = await postIntelJson(config, '/internal/tools/execute', {
          tool: 'fetch_source',
          input: parsed.input,
          correlationId,
          idempotencyKey,
        });
        if (!intel.ok) {
          if (intel.status === 503 && intel.message === 'tool_intel_base_unconfigured') {
            return {
              ok: false,
              tool: parsed.tool,
              code: 'UNAVAILABLE',
              message:
                'Action tools require SIGNAL_TOOL_INTEL_BASE_URL (and optional SIGNAL_TOOL_INTEL_SECRET) for services/intel.',
              details: intel.body,
            };
          }
          return {
            ok: false,
            tool: parsed.tool,
            code: 'UPSTREAM_ERROR',
            message: intel.message,
            details: intel.body,
          };
        }
        const exec = SignalToolExecutionResponseSchema.safeParse(intel.json);
        if (!exec.success) {
          return {
            ok: false,
            tool: parsed.tool,
            code: 'UPSTREAM_ERROR',
            message: 'intel_tools_execute_shape_mismatch',
            details: exec.error.flatten(),
          };
        }
        const r = exec.data;
        if (r.status === 'success') {
          return { ok: true, tool: parsed.tool, kind: 'action', output: r.output };
        }
        return {
          ok: false,
          tool: parsed.tool,
          code: 'UPSTREAM_ERROR',
          message: `tool_execution_${r.status}`,
          details: r,
        };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      tool: parsed.tool,
      code: 'INTERNAL',
      message,
    };
  }
}
