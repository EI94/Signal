import { z } from 'zod';
import { EvaluateAlertsRequestSchema } from './alert-rules-engine';
import { EntityDetailTimelineQueryV1Schema, EntityPathParamsV1Schema } from './api-entities';
import { MapSignalsQueryV1Schema } from './api-map';
import type { SignalsFeedGetInput } from './api-signals';
import { SignalsFeedGetInputSchema } from './api-signals';
import { SendAlertEmailRequestSchema, SendBriefEmailRequestSchema } from './email-delivery';
import { FetchSourceToolInputSchema } from './internal-tools';
import { GenerateMorningBriefRequestSchema } from './morning-brief';

/**
 * WS11.1 — Stable product-facing tool surface for agents / external orchestrators.
 * Execution is implemented in apps/api (read models + optional HTTP to services/intel).
 * Distinct from `SignalInternalToolName` (registry) and from the orchestrator envelope.
 */

export const EXPOSED_TOOL_NAMES = [
  'board_summary.get',
  'signals_feed.get',
  'entity_context.get',
  'map_signals.get',
  'brief.generate',
  'brief.send_email',
  'alerts.evaluate',
  'alerts.send_email',
  'source.fetch',
] as const;

export type ExposedToolName = (typeof EXPOSED_TOOL_NAMES)[number];

export const ExposedToolNameSchema = z.enum(EXPOSED_TOOL_NAMES);

export const ExposedToolKindSchema = z.enum(['read', 'action']);

export type ExposedToolKind = z.infer<typeof ExposedToolKindSchema>;

/** Curated static metadata (no runtime availability — see tool-exposure-v1.md). */
export const ExposedToolDescriptorSchema = z.object({
  name: ExposedToolNameSchema,
  description: z.string().min(1),
  kind: ExposedToolKindSchema,
  /** Where execution is wired (for operators; not a live URL). */
  mapsTo: z.string().min(1),
});

export type ExposedToolDescriptor = z.infer<typeof ExposedToolDescriptorSchema>;

export const EXPOSED_TOOL_DESCRIPTORS: readonly ExposedToolDescriptor[] = [
  {
    name: 'board_summary.get',
    description: 'Aggregated board KPIs from the latest signals window for the workspace.',
    kind: 'read',
    mapsTo: 'read model `buildBoardSummaryFromWindow` (same as GET /v1/board/summary)',
  },
  {
    name: 'signals_feed.get',
    description: 'Paginated, filterable signal feed slice (same contract as GET /v1/signals).',
    kind: 'read',
    mapsTo: 'read model `buildSignalsFeedFromWindow`',
  },
  {
    name: 'entity_context.get',
    description:
      'Entity card + timeline preview for one entity (same as GET /v1/entities/:type/:id).',
    kind: 'read',
    mapsTo: 'read model `buildEntityDetailReadModel`',
  },
  {
    name: 'map_signals.get',
    description: 'Map-oriented signal points for the workspace (same as GET /v1/map/signals).',
    kind: 'read',
    mapsTo: 'read model `buildMapSignalsFromWindow`',
  },
  {
    name: 'brief.generate',
    description:
      'Runs morning brief generation for the workspace (POST intel /internal/generate-brief).',
    kind: 'action',
    mapsTo: 'HTTP POST services/intel `/internal/generate-brief`',
  },
  {
    name: 'brief.send_email',
    description: 'Sends a brief by email via Resend (POST intel /internal/send-brief-email).',
    kind: 'action',
    mapsTo: 'HTTP POST services/intel `/internal/send-brief-email`',
  },
  {
    name: 'alerts.evaluate',
    description: 'Evaluates alert rules for one signal (POST intel /internal/evaluate-alerts).',
    kind: 'action',
    mapsTo: 'HTTP POST services/intel `/internal/evaluate-alerts`',
  },
  {
    name: 'alerts.send_email',
    description: 'Sends an alert notification email (POST intel /internal/send-alert-email).',
    kind: 'action',
    mapsTo: 'HTTP POST services/intel `/internal/send-alert-email`',
  },
  {
    name: 'source.fetch',
    description:
      'Triggers one ingest run-once for a registry source (intel internal tools.execute → fetch_source).',
    kind: 'action',
    mapsTo: 'HTTP POST services/intel `/internal/tools/execute` (tool `fetch_source`)',
  },
];

/** Workspace is always taken from auth/workspace resolution — omitted from exposed JSON. */
export const BoardSummaryGetInputSchema = z.object({}).strict();

export const EntityContextGetInputSchema = EntityPathParamsV1Schema.merge(
  EntityDetailTimelineQueryV1Schema,
);

export const MapSignalsGetInputSchema = MapSignalsQueryV1Schema.omit({ workspaceId: true });

export const BriefGenerateExposureInputSchema = GenerateMorningBriefRequestSchema.omit({
  workspaceId: true,
});

export const BriefSendEmailExposureInputSchema = SendBriefEmailRequestSchema.omit({
  workspaceId: true,
});

export const AlertsEvaluateExposureInputSchema = EvaluateAlertsRequestSchema.omit({
  workspaceId: true,
});

export const AlertsSendEmailExposureInputSchema = SendAlertEmailRequestSchema.omit({
  workspaceId: true,
});

export const SourceFetchExposureInputSchema = FetchSourceToolInputSchema;

export type BoardSummaryGetInput = z.infer<typeof BoardSummaryGetInputSchema>;
export type EntityContextGetInput = z.infer<typeof EntityContextGetInputSchema>;
export type MapSignalsGetInput = z.infer<typeof MapSignalsGetInputSchema>;
export type BriefGenerateExposureInput = z.infer<typeof BriefGenerateExposureInputSchema>;
export type BriefSendEmailExposureInput = z.infer<typeof BriefSendEmailExposureInputSchema>;
export type AlertsEvaluateExposureInput = z.infer<typeof AlertsEvaluateExposureInputSchema>;
export type AlertsSendEmailExposureInput = z.infer<typeof AlertsSendEmailExposureInputSchema>;
export type SourceFetchExposureInput = z.infer<typeof SourceFetchExposureInputSchema>;

export type ParsedExposedToolInput =
  | { tool: 'board_summary.get'; input: BoardSummaryGetInput }
  | { tool: 'signals_feed.get'; input: SignalsFeedGetInput }
  | { tool: 'entity_context.get'; input: EntityContextGetInput }
  | { tool: 'map_signals.get'; input: MapSignalsGetInput }
  | { tool: 'brief.generate'; input: BriefGenerateExposureInput }
  | { tool: 'brief.send_email'; input: BriefSendEmailExposureInput }
  | { tool: 'alerts.evaluate'; input: AlertsEvaluateExposureInput }
  | { tool: 'alerts.send_email'; input: AlertsSendEmailExposureInput }
  | { tool: 'source.fetch'; input: SourceFetchExposureInput };

/**
 * Validates `input` for a named exposed tool. Workspace id is never accepted here (injected server-side).
 */
export function parseExposedToolInput(
  tool: ExposedToolName,
  raw: unknown,
): { ok: true; data: ParsedExposedToolInput } | { ok: false; error: z.ZodError } {
  const input = raw === undefined || raw === null ? {} : raw;
  switch (tool) {
    case 'board_summary.get': {
      const r = BoardSummaryGetInputSchema.safeParse(input);
      return r.success
        ? { ok: true, data: { tool, input: r.data } }
        : { ok: false, error: r.error };
    }
    case 'signals_feed.get': {
      const r = SignalsFeedGetInputSchema.safeParse(input);
      return r.success
        ? { ok: true, data: { tool, input: r.data } }
        : { ok: false, error: r.error };
    }
    case 'entity_context.get': {
      const r = EntityContextGetInputSchema.safeParse(input);
      return r.success
        ? { ok: true, data: { tool, input: r.data } }
        : { ok: false, error: r.error };
    }
    case 'map_signals.get': {
      const r = MapSignalsGetInputSchema.safeParse(input);
      return r.success
        ? { ok: true, data: { tool, input: r.data } }
        : { ok: false, error: r.error };
    }
    case 'brief.generate': {
      const r = BriefGenerateExposureInputSchema.safeParse(input);
      return r.success
        ? { ok: true, data: { tool, input: r.data } }
        : { ok: false, error: r.error };
    }
    case 'brief.send_email': {
      const r = BriefSendEmailExposureInputSchema.safeParse(input);
      return r.success
        ? { ok: true, data: { tool, input: r.data } }
        : { ok: false, error: r.error };
    }
    case 'alerts.evaluate': {
      const r = AlertsEvaluateExposureInputSchema.safeParse(input);
      return r.success
        ? { ok: true, data: { tool, input: r.data } }
        : { ok: false, error: r.error };
    }
    case 'alerts.send_email': {
      const r = AlertsSendEmailExposureInputSchema.safeParse(input);
      return r.success
        ? { ok: true, data: { tool, input: r.data } }
        : { ok: false, error: r.error };
    }
    case 'source.fetch': {
      const r = SourceFetchExposureInputSchema.safeParse(input);
      return r.success
        ? { ok: true, data: { tool, input: r.data } }
        : { ok: false, error: r.error };
    }
  }
}

export const ToolExposureExecuteRequestSchema = z.object({
  tool: ExposedToolNameSchema,
  /** Tool-specific JSON; workspace id is never set here (resolved from auth). */
  input: z.unknown().optional(),
  correlationId: z.string().max(256).optional(),
  idempotencyKey: z.string().max(256).optional(),
});

export type ToolExposureExecuteRequest = z.infer<typeof ToolExposureExecuteRequestSchema>;

export const ToolExposureErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAVAILABLE',
  'UPSTREAM_ERROR',
  'INTERNAL',
]);

export type ToolExposureErrorCode = z.infer<typeof ToolExposureErrorCodeSchema>;

export const ToolExposureSuccessResponseSchema = z.object({
  ok: z.literal(true),
  tool: ExposedToolNameSchema,
  kind: ExposedToolKindSchema,
  output: z.unknown(),
});

export const ToolExposureErrorResponseSchema = z.object({
  ok: z.literal(false),
  tool: ExposedToolNameSchema,
  code: ToolExposureErrorCodeSchema,
  message: z.string().min(1),
  details: z.unknown().optional(),
});

export const ToolExposureExecuteResponseSchema = z.discriminatedUnion('ok', [
  ToolExposureSuccessResponseSchema,
  ToolExposureErrorResponseSchema,
]);

export type ToolExposureExecuteResponse = z.infer<typeof ToolExposureExecuteResponseSchema>;

export const ToolsExposureListV1ResponseSchema = z.object({
  tools: z.array(ExposedToolDescriptorSchema),
});

export type ToolsExposureListV1Response = z.infer<typeof ToolsExposureListV1ResponseSchema>;
