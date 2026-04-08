import { z } from 'zod';
import {
  type SignalToolExecutionRequest,
  SignalToolExecutionRequestSchema,
} from './agent-orchestrator';

/**
 * Internal / admin HTTP contracts (authenticated, not browser-public).
 * Narrow by design — no broad CRUD.
 */

/** Reuses the orchestration envelope from WS5.4 (intel internal route). */
export const InternalToolExecutionRequestV1Schema = SignalToolExecutionRequestSchema;
export type InternalToolExecutionRequestV1 = SignalToolExecutionRequest;

/** POST body to trigger a single source fetch via orchestration (`fetch_source` tool). */
export const InternalTriggerSourceFetchV1BodySchema = z.object({
  sourceId: z.string().uuid(),
  correlationId: z.string().max(256).optional(),
});

export type InternalTriggerSourceFetchV1Body = z.infer<
  typeof InternalTriggerSourceFetchV1BodySchema
>;

/** Minimal row for inspecting registry-backed sources (not full `SourceRegistryDocument`). */
export const InternalSourceSummaryV1Schema = z.object({
  sourceId: z.string().uuid(),
  registrySourceType: z.string().min(1),
  sourceUrl: z.string().url(),
  ingestState: z.string().optional(),
});

export type InternalSourceSummaryV1 = z.infer<typeof InternalSourceSummaryV1Schema>;

export const InternalSourcesListV1ResponseSchema = z.object({
  items: z.array(InternalSourceSummaryV1Schema).max(500),
});

export type InternalSourcesListV1Response = z.infer<typeof InternalSourcesListV1ResponseSchema>;
