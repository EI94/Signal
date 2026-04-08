import { z } from 'zod';
import {
  EXPOSED_TOOL_DESCRIPTORS,
  EXPOSED_TOOL_NAMES,
  type ExposedToolDescriptor,
  ExposedToolKindSchema,
  ExposedToolNameSchema,
} from './tool-exposure';

/**
 * WS11.2 — Transport/protocol-neutral capability descriptors for future MCP-style surfaces.
 * Not MCP protocol: no JSON-RPC, no stdio. Only stable JSON-serializable metadata + schema hints.
 * Authoritative validation remains `parseExposedToolInput` + serving contracts in apps/api.
 */

/** JSON Schema draft-07-style fragment (manually curated; not a generic Zod→JSON-Schema converter). */
export const McpReadySchemaProjectionSchema = z.record(z.string(), z.unknown());

export type McpReadySchemaProjection = z.infer<typeof McpReadySchemaProjectionSchema>;

export const McpReadyAvailabilitySchema = z.enum([
  /** Read tools run in-process when Firestore/read models are available. */
  'available',
  /** Action tools need `SIGNAL_TOOL_INTEL_BASE_URL` (and optional secret) at runtime. */
  'action_requires_upstream_intel',
]);

export type McpReadyAvailability = z.infer<typeof McpReadyAvailabilitySchema>;

export const McpReadyCapabilityV1Schema = z.object({
  name: ExposedToolNameSchema,
  description: z.string().min(1),
  kind: ExposedToolKindSchema,
  availability: McpReadyAvailabilitySchema,
  /** Curated input shape hint; strict validation is `parseExposedToolInput` in tool-exposure. */
  inputSchemaProjection: McpReadySchemaProjectionSchema,
  /** Curated output shape hint; server validates success payloads against product Zod where applicable. */
  outputSchemaProjection: McpReadySchemaProjectionSchema,
  authBoundary: z.literal('authenticated_workspace_membership'),
  /** Where invocation is wired today (no alternate execution path). */
  executionSurface: z.literal('exposed_tools_v1'),
  /** Workspace id is never in tool JSON; resolved from auth + membership (same as POST /v1/tools/execute). */
  workspaceResolution: z.literal('server_injected_from_membership'),
});

export type McpReadyCapabilityV1 = z.infer<typeof McpReadyCapabilityV1Schema>;

export const McpReadyCapabilitiesListV1ResponseSchema = z.object({
  capabilities: z.array(McpReadyCapabilityV1Schema),
});

export type McpReadyCapabilitiesListV1Response = z.infer<
  typeof McpReadyCapabilitiesListV1ResponseSchema
>;

/** Per-tool schema hints keyed by exposed name (manual; keep aligned with tool-exposure input parsers). */
const MCP_INPUT_OUTPUT: Record<
  (typeof EXPOSED_TOOL_NAMES)[number],
  { input: McpReadySchemaProjection; output: McpReadySchemaProjection }
> = {
  'board_summary.get': {
    input: { type: 'object', additionalProperties: false, properties: {} },
    output: {
      type: 'object',
      description: 'On success: `BoardSummaryV1Response` (@signal/contracts `api-board-summary`).',
    },
  },
  'signals_feed.get': {
    input: {
      type: 'object',
      additionalProperties: true,
      description:
        'SignalsFeedGetInput — cursor pagination + filters; see `SignalsFeedFiltersV1Schema` in api-signals.',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        cursor: { type: 'string' },
        signalType: { type: 'string' },
        status: { type: 'string' },
        novelty: { type: 'string' },
        minScore: { type: 'integer', minimum: 0, maximum: 100 },
        entityType: { type: 'string' },
        entityId: { type: 'string' },
        detectedAfter: { type: 'string', format: 'date-time' },
        detectedBefore: { type: 'string', format: 'date-time' },
        occurredAfter: { type: 'string', format: 'date-time' },
        occurredBefore: { type: 'string', format: 'date-time' },
        sort: {
          type: 'string',
          enum: ['detected_at_desc', 'occurred_at_desc', 'score_desc'],
        },
        includeFacets: { type: 'boolean' },
      },
    },
    output: {
      type: 'object',
      description: 'On success: `SignalsFeedV1Response` (workspaceId injected server-side).',
    },
  },
  'entity_context.get': {
    input: {
      type: 'object',
      additionalProperties: true,
      description: 'EntityPathParams + EntityDetailTimelineQueryV1 (no workspaceId).',
      properties: {
        entityType: { type: 'string' },
        entityId: { type: 'string' },
        timelineLimit: { type: 'integer', minimum: 1, maximum: 32 },
        timelineCursor: { type: 'string' },
        timelineSignalType: { type: 'string' },
        timelineStatus: { type: 'string' },
        timelineMinScore: { type: 'integer', minimum: 0, maximum: 100 },
        timelineDetectedBefore: { type: 'string', format: 'date-time' },
        timelineDetectedAfter: { type: 'string', format: 'date-time' },
      },
      required: ['entityType', 'entityId'],
    },
    output: {
      type: 'object',
      description: 'On success: `EntityDetailV1Response`.',
    },
  },
  'map_signals.get': {
    input: {
      type: 'object',
      additionalProperties: true,
      description: 'MapSignalsQuery minus workspaceId — see `MapSignalsGetInputSchema`.',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        cursor: { type: 'string' },
        minScore: { type: 'integer', minimum: 0, maximum: 100 },
        signalType: { type: 'string' },
      },
    },
    output: {
      type: 'object',
      description: 'On success: `MapSignalsV1Response`.',
    },
  },
  'brief.generate': {
    input: {
      type: 'object',
      additionalProperties: false,
      required: ['briefType'],
      properties: {
        briefType: { type: 'string', enum: ['daily_workspace', 'board_digest'] },
        periodDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      },
    },
    output: {
      type: 'object',
      description:
        'On success: `MorningBriefGenerationResult` or skipped payload from intel; see execute-exposed-tool.',
    },
  },
  'brief.send_email': {
    input: {
      type: 'object',
      additionalProperties: false,
      required: ['briefId', 'to'],
      properties: {
        briefId: { type: 'string' },
        to: {
          type: 'array',
          items: { type: 'string', format: 'email' },
          minItems: 1,
          maxItems: 20,
        },
      },
    },
    output: {
      type: 'object',
      description: 'On success: `SendEmailDeliveryResponse`.',
    },
  },
  'alerts.evaluate': {
    input: {
      type: 'object',
      additionalProperties: false,
      required: ['signalId'],
      properties: {
        signalId: { type: 'string' },
        evaluationRunId: { type: 'string' },
      },
    },
    output: {
      type: 'object',
      description: 'On success: `EvaluateAlertsResponse` or skipped payload from intel.',
    },
  },
  'alerts.send_email': {
    input: {
      type: 'object',
      additionalProperties: false,
      required: ['alertRuleId', 'signalId', 'to'],
      properties: {
        alertRuleId: { type: 'string' },
        signalId: { type: 'string' },
        to: {
          type: 'array',
          items: { type: 'string', format: 'email' },
          minItems: 1,
          maxItems: 20,
        },
        evaluationReference: { type: 'string', maxLength: 512 },
      },
    },
    output: {
      type: 'object',
      description: 'On success: `SendEmailDeliveryResponse`.',
    },
  },
  'source.fetch': {
    input: {
      type: 'object',
      additionalProperties: false,
      required: ['sourceId'],
      properties: {
        sourceId: { type: 'string', format: 'uuid' },
      },
    },
    output: {
      type: 'object',
      description:
        'On success: internal tool success output for `fetch_source` (see `SignalToolExecutionResponse`).',
    },
  },
};

function descriptorByName(name: (typeof EXPOSED_TOOL_NAMES)[number]): ExposedToolDescriptor {
  const d = EXPOSED_TOOL_DESCRIPTORS.find((x) => x.name === name);
  if (!d) {
    throw new Error(`mcp-ready: missing EXPOSED_TOOL_DESCRIPTORS entry for ${name}`);
  }
  return d;
}

/**
 * Stable capability list aligned with WS11.1 exposed tools — for GET `/v1/tools/capabilities` and future MCP adapters.
 */
export function listMcpReadyCapabilities(): readonly McpReadyCapabilityV1[] {
  return EXPOSED_TOOL_NAMES.map((name) => {
    const d = descriptorByName(name);
    const io = MCP_INPUT_OUTPUT[name];
    const availability: McpReadyAvailability =
      d.kind === 'read' ? 'available' : 'action_requires_upstream_intel';
    return McpReadyCapabilityV1Schema.parse({
      name: d.name,
      description: d.description,
      kind: d.kind,
      availability,
      inputSchemaProjection: io.input,
      outputSchemaProjection: io.output,
      authBoundary: 'authenticated_workspace_membership',
      executionSurface: 'exposed_tools_v1',
      workspaceResolution: 'server_injected_from_membership',
    });
  });
}
