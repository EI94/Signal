import { z } from 'zod';
import { type SignalsFeedGetInput, SignalsFeedGetInputSchema } from './api-signals';
import type {
  AlertsEvaluateExposureInput,
  AlertsSendEmailExposureInput,
  BoardSummaryGetInput,
  BriefGenerateExposureInput,
  BriefSendEmailExposureInput,
  EntityContextGetInput,
} from './tool-exposure';
import {
  AlertsEvaluateExposureInputSchema,
  AlertsSendEmailExposureInputSchema,
  BoardSummaryGetInputSchema,
  BriefGenerateExposureInputSchema,
  BriefSendEmailExposureInputSchema,
  EntityContextGetInputSchema,
} from './tool-exposure';

/**
 * WS11.3 — Product-facing agent→dashboard verbs: bounded effects + navigation context.
 * Execution delegates to exposed tools (`invokeViaMcpReadyAdapter`); no duplicate business logic.
 */

export const AGENT_DASHBOARD_ACTION_NAMES = [
  'brief.create',
  'brief.send_email',
  'alerts.evaluate',
  'alerts.send_email',
  'context.open_board',
  'context.open_signals',
  'context.open_entity',
] as const;

export type AgentDashboardActionName = (typeof AGENT_DASHBOARD_ACTION_NAMES)[number];

export const AgentDashboardActionNameSchema = z.enum(AGENT_DASHBOARD_ACTION_NAMES);

export const AgentDashboardActionLayerKindSchema = z.enum(['effectful', 'read_context']);

export type AgentDashboardActionLayerKind = z.infer<typeof AgentDashboardActionLayerKindSchema>;

export const AgentDashboardActionDescriptorSchema = z.object({
  name: AgentDashboardActionNameSchema,
  description: z.string().min(1),
  layerKind: AgentDashboardActionLayerKindSchema,
  /** Underlying exposed tool name (same execution path as POST /v1/tools/execute). */
  mapsToExposedTool: z.string().min(1),
});

export type AgentDashboardActionDescriptor = z.infer<typeof AgentDashboardActionDescriptorSchema>;

export const AGENT_DASHBOARD_ACTION_DESCRIPTORS: readonly AgentDashboardActionDescriptor[] = [
  {
    name: 'brief.create',
    description:
      'Generate a morning brief for the workspace (same as exposed tool `brief.generate`).',
    layerKind: 'effectful',
    mapsToExposedTool: 'brief.generate',
  },
  {
    name: 'brief.send_email',
    description: 'Send an existing brief by email (same as `brief.send_email`).',
    layerKind: 'effectful',
    mapsToExposedTool: 'brief.send_email',
  },
  {
    name: 'alerts.evaluate',
    description: 'Evaluate alert rules for one signal (same as `alerts.evaluate`).',
    layerKind: 'effectful',
    mapsToExposedTool: 'alerts.evaluate',
  },
  {
    name: 'alerts.send_email',
    description: 'Send an alert notification email (same as `alerts.send_email`).',
    layerKind: 'effectful',
    mapsToExposedTool: 'alerts.send_email',
  },
  {
    name: 'context.open_board',
    description: 'Load board summary and point the client at the home board surface.',
    layerKind: 'read_context',
    mapsToExposedTool: 'board_summary.get',
  },
  {
    name: 'context.open_signals',
    description: 'Load a feed slice and point the client at `/signals` with matching query hints.',
    layerKind: 'read_context',
    mapsToExposedTool: 'signals_feed.get',
  },
  {
    name: 'context.open_entity',
    description: 'Load entity detail and point the client at the entity page.',
    layerKind: 'read_context',
    mapsToExposedTool: 'entity_context.get',
  },
];

/** Navigation hint for dashboard clients (paths match `apps/web` App Router). */
export const AgentDashboardNextContextSchema = z.object({
  route: z.string().min(1),
  label: z.string().min(1).optional(),
});

export type AgentDashboardNextContext = z.infer<typeof AgentDashboardNextContextSchema>;

export const AgentDashboardActionExecuteRequestSchema = z.object({
  action: AgentDashboardActionNameSchema,
  input: z.unknown().optional(),
  correlationId: z.string().max(256).optional(),
});

export type AgentDashboardActionExecuteRequest = z.infer<
  typeof AgentDashboardActionExecuteRequestSchema
>;

export const AgentDashboardActionErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAVAILABLE',
  'UPSTREAM_ERROR',
  'INTERNAL',
]);

export type AgentDashboardActionErrorCode = z.infer<typeof AgentDashboardActionErrorCodeSchema>;

export const AgentDashboardActionExecuteSuccessSchema = z.object({
  ok: z.literal(true),
  action: AgentDashboardActionNameSchema,
  layerKind: AgentDashboardActionLayerKindSchema,
  result: z.unknown(),
  nextContext: AgentDashboardNextContextSchema.optional(),
});

export const AgentDashboardActionExecuteFailureSchema = z.object({
  ok: z.literal(false),
  action: AgentDashboardActionNameSchema,
  code: AgentDashboardActionErrorCodeSchema,
  message: z.string().min(1),
  details: z.unknown().optional(),
});

export const AgentDashboardActionExecuteResponseSchema = z.discriminatedUnion('ok', [
  AgentDashboardActionExecuteSuccessSchema,
  AgentDashboardActionExecuteFailureSchema,
]);

export type AgentDashboardActionExecuteResponse = z.infer<
  typeof AgentDashboardActionExecuteResponseSchema
>;

export const AgentDashboardActionsListV1ResponseSchema = z.object({
  actions: z.array(AgentDashboardActionDescriptorSchema),
});

export type AgentDashboardActionsListV1Response = z.infer<
  typeof AgentDashboardActionsListV1ResponseSchema
>;

export type ParsedAgentDashboardActionInput =
  | { action: 'brief.create'; input: BriefGenerateExposureInput }
  | { action: 'brief.send_email'; input: BriefSendEmailExposureInput }
  | { action: 'alerts.evaluate'; input: AlertsEvaluateExposureInput }
  | { action: 'alerts.send_email'; input: AlertsSendEmailExposureInput }
  | { action: 'context.open_board'; input: BoardSummaryGetInput }
  | { action: 'context.open_signals'; input: SignalsFeedGetInput }
  | { action: 'context.open_entity'; input: EntityContextGetInput };

/**
 * Validates action-specific input (workspace id never accepted — membership injects it).
 */
export function parseAgentDashboardActionInput(
  action: AgentDashboardActionName,
  raw: unknown,
): { ok: true; data: ParsedAgentDashboardActionInput } | { ok: false; error: z.ZodError } {
  const input = raw === undefined || raw === null ? {} : raw;
  switch (action) {
    case 'brief.create': {
      const r = BriefGenerateExposureInputSchema.safeParse(input);
      return r.success
        ? { ok: true, data: { action, input: r.data } }
        : { ok: false, error: r.error };
    }
    case 'brief.send_email': {
      const r = BriefSendEmailExposureInputSchema.safeParse(input);
      return r.success
        ? { ok: true, data: { action, input: r.data } }
        : { ok: false, error: r.error };
    }
    case 'alerts.evaluate': {
      const r = AlertsEvaluateExposureInputSchema.safeParse(input);
      return r.success
        ? { ok: true, data: { action, input: r.data } }
        : { ok: false, error: r.error };
    }
    case 'alerts.send_email': {
      const r = AlertsSendEmailExposureInputSchema.safeParse(input);
      return r.success
        ? { ok: true, data: { action, input: r.data } }
        : { ok: false, error: r.error };
    }
    case 'context.open_board': {
      const r = BoardSummaryGetInputSchema.safeParse(input);
      return r.success
        ? { ok: true, data: { action, input: r.data } }
        : { ok: false, error: r.error };
    }
    case 'context.open_signals': {
      const r = SignalsFeedGetInputSchema.safeParse(input);
      return r.success
        ? { ok: true, data: { action, input: r.data } }
        : { ok: false, error: r.error };
    }
    case 'context.open_entity': {
      const r = EntityContextGetInputSchema.safeParse(input);
      return r.success
        ? { ok: true, data: { action, input: r.data } }
        : { ok: false, error: r.error };
    }
  }
}
