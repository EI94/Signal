import { z } from 'zod';
import {
  type EvaluateAlertsResponse,
  EvaluateAlertsResponseSchema,
  EvaluationRunIdSchema,
} from './alert-rules-engine';
import { ExtractSourceContentRequestSchema } from './extracted-event';
import { IngestRunOnceResponseSchema } from './ingest-fetch-outcome';
import {
  GenerateMorningBriefRequestSchema,
  type MorningBriefGenerationResult,
  MorningBriefGenerationResultSchema,
} from './morning-brief';
import { PromoteSourceContentSignalsRequestSchema } from './signal';

/**
 * Canonical internal tool ids for orchestration surfaces (WS5.x). No provider coupling.
 * Some tools delegate to services/ingest or services/intel; unavailable tools fail explicitly.
 */

export const SIGNAL_INTERNAL_TOOL_NAMES = [
  'fetch_source',
  'extract_events',
  'score_signal',
  'summarize_delta',
  'generate_brief',
  'evaluate_alerts',
] as const;

export type SignalInternalToolName = (typeof SIGNAL_INTERNAL_TOOL_NAMES)[number];

export const SignalInternalToolNameSchema = z.enum(SIGNAL_INTERNAL_TOOL_NAMES);

/** Declared capability state for listing; runtime may still return `unavailable` if config blocks execution. */
export const InternalToolDeclarationSchema = z.enum([
  /** Wired to a real code path in this repo. */
  'implemented',
  /** No production implementation yet; execute returns not_implemented. */
  'not_implemented',
  /**
   * Implemented but requires optional wiring (e.g. ingest HTTP base URL for `fetch_source`).
   */
  'requires_configuration',
]);

export type InternalToolDeclaration = z.infer<typeof InternalToolDeclarationSchema>;

export const InternalToolDescriptorSchema = z.object({
  name: SignalInternalToolNameSchema,
  description: z.string().min(1),
  declaration: InternalToolDeclarationSchema,
});

export type InternalToolDescriptor = z.infer<typeof InternalToolDescriptorSchema>;

// --- fetch_source → POST services/ingest /internal/run-once ---

export const FetchSourceToolInputSchema = z.object({
  /** When set, only this registry source is processed; mirrors ingest run-once body. */
  sourceId: z.string().uuid(),
});

export type FetchSourceToolInput = z.infer<typeof FetchSourceToolInputSchema>;

/** Successful ingest run-once payload (validated against existing contract). */
export const FetchSourceToolOutputSchema = IngestRunOnceResponseSchema;

export type FetchSourceToolOutput = z.infer<typeof FetchSourceToolOutputSchema>;

// --- extract_events → processExtractSourceContent ---

export const ExtractEventsToolInputSchema = ExtractSourceContentRequestSchema;

export type ExtractEventsToolInput = z.infer<typeof ExtractEventsToolInputSchema>;

/** Mirrors `processExtractSourceContent` success results (excludes thrown errors). */
export const ExtractEventsToolOutputSchema = z.union([
  z.object({
    ok: z.literal(true),
    skipped: z.literal(true),
    reason: z.literal('extraction_disabled'),
  }),
  z.object({
    ok: z.literal(true),
    skipped: z.literal(false),
    sourceContentId: z.string().min(1),
    extractedEventCount: z.number().int().nonnegative(),
    extractionStatus: z.enum(['extracted_ready', 'no_events_detected']),
  }),
]);

export type ExtractEventsToolOutput = z.infer<typeof ExtractEventsToolOutputSchema>;

// --- score_signal → processPromoteSourceContentSignals (deterministic promotion + scoring) ---

export const ScoreSignalToolInputSchema = PromoteSourceContentSignalsRequestSchema;

export type ScoreSignalToolInput = z.infer<typeof ScoreSignalToolInputSchema>;

/** Mirrors `processPromoteSourceContentSignals` success results (excludes thrown errors). */
export const ScoreSignalToolOutputSchema = z.union([
  z.object({
    ok: z.literal(true),
    skipped: z.literal(true),
    reason: z.enum(['promotion_disabled', 'no_extracted_events']),
  }),
  z.object({
    ok: z.literal(true),
    skipped: z.literal(false),
    sourceContentId: z.string().min(1),
    promotedSignalCount: z.number().int().nonnegative(),
    extractionStatus: z.literal('promoted_ready'),
  }),
]);

export type ScoreSignalToolOutput = z.infer<typeof ScoreSignalToolOutputSchema>;

// --- summarize_delta → optional Perplexity enrichment (services/intel) — not on deterministic path ---

export const SummarizeDeltaToolInputSchema = z.object({
  /** Human-readable title for the delta or document. */
  title: z.string().min(1).max(500),
  /** Short excerpt (normalized text or summary) to condense; bounded for safety. */
  shortSummary: z.string().min(1).max(32_000),
  sourceType: z.string().max(200).optional(),
  signalType: z.string().max(200).optional(),
  /** Optional 32-char hex SourceContent id for traceability. */
  sourceContentId: z
    .string()
    .regex(/^[a-f0-9]{32}$/)
    .optional(),
  entityNames: z.array(z.string().min(1).max(200)).max(24).optional(),
  /** Free-text context on authority or confidence (e.g. source tier). */
  sourceAuthority: z.string().max(2000).optional(),
});

export type SummarizeDeltaToolInput = z.infer<typeof SummarizeDeltaToolInputSchema>;

/** Model JSON only (provider metadata added server-side). */
export const SummarizeDeltaProviderResultSchema = z.object({
  conciseSummary: z.string().min(1).max(8000),
  keyPoints: z.array(z.string().min(1).max(500)).min(1).max(12),
  confidenceNote: z.string().max(2000).optional(),
});

export type SummarizeDeltaProviderResult = z.infer<typeof SummarizeDeltaProviderResultSchema>;

export const SummarizeDeltaToolOutputSchema = SummarizeDeltaProviderResultSchema.extend({
  provider: z
    .object({
      id: z.enum(['perplexity']),
      model: z.string().min(1),
      latencyMs: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export type SummarizeDeltaToolOutput = z.infer<typeof SummarizeDeltaToolOutputSchema>;

export type InternalToolSuccessOutput =
  | FetchSourceToolOutput
  | ExtractEventsToolOutput
  | ScoreSignalToolOutput
  | SummarizeDeltaToolOutput
  | MorningBriefGenerationResult
  | EvaluateAlertsResponse;

/**
 * Validates payload for tools that can return `ok: true` from `executeSignalInternalTool`.
 * Used by the registry and by the agent orchestrator guardrail (single source of truth).
 */
export function safeParseInternalToolSuccessOutput(
  tool: SignalInternalToolName,
  output: unknown,
): { ok: true; data: InternalToolSuccessOutput } | { ok: false; error: z.ZodError } {
  switch (tool) {
    case 'fetch_source': {
      const r = FetchSourceToolOutputSchema.safeParse(output);
      return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error };
    }
    case 'extract_events': {
      const r = ExtractEventsToolOutputSchema.safeParse(output);
      return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error };
    }
    case 'score_signal': {
      const r = ScoreSignalToolOutputSchema.safeParse(output);
      return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error };
    }
    case 'summarize_delta': {
      const r = SummarizeDeltaToolOutputSchema.safeParse(output);
      return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error };
    }
    case 'generate_brief': {
      const r = MorningBriefGenerationResultSchema.safeParse(output);
      return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error };
    }
    case 'evaluate_alerts': {
      const r = EvaluateAlertsResponseSchema.safeParse(output);
      return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error };
    }
    default: {
      return {
        ok: false,
        error: new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            message: 'internal_tool_has_no_validated_success_output',
            path: ['tool'],
          },
        ]),
      };
    }
  }
}

// --- generate_brief → POST services/intel /internal/generate-brief ---

export const GenerateBriefToolInputSchema = GenerateMorningBriefRequestSchema;

export const EvaluateAlertsToolInputSchema = z.object({
  signalId: z.string().min(1).optional(),
  /** Same semantics as `POST /internal/evaluate-alerts` body `evaluationRunId`. */
  evaluationRunId: EvaluationRunIdSchema.optional(),
});

export const NotImplementedToolOutputSchema = z.object({
  status: z.literal('not_implemented'),
  tool: SignalInternalToolNameSchema,
  message: z.string(),
});

export type NotImplementedToolOutput = z.infer<typeof NotImplementedToolOutputSchema>;

/** POST body for a single tool invocation (e.g. future internal route). */
export const SignalInternalToolInvokeRequestSchema = z.object({
  tool: SignalInternalToolNameSchema,
  input: z.unknown(),
});

export type SignalInternalToolInvokeRequest = z.infer<typeof SignalInternalToolInvokeRequestSchema>;

export const SignalInternalToolInvokeResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    tool: SignalInternalToolNameSchema,
    output: z.unknown(),
  }),
  z.object({
    ok: z.literal(false),
    tool: SignalInternalToolNameSchema,
    error: z.enum(['validation', 'execution', 'not_implemented', 'unavailable']),
    message: z.string(),
    details: z.unknown().optional(),
  }),
]);

export type SignalInternalToolInvokeResult = z.infer<typeof SignalInternalToolInvokeResultSchema>;
