import type { IntelRuntimeConfig } from '@signal/config';
import {
  EvaluateAlertsToolInputSchema,
  ExtractEventsToolInputSchema,
  FetchSourceToolInputSchema,
  GenerateMorningBriefRequestSchema,
  type InternalToolDeclaration,
  type InternalToolDescriptor,
  ScoreSignalToolInputSchema,
  type SignalInternalToolInvokeResult,
  type SignalInternalToolName,
  SummarizeDeltaToolInputSchema,
  safeParseInternalToolSuccessOutput,
} from '@signal/contracts';
import { evaluateAlertsForSignal } from './evaluate-alerts-for-signal';
import { getFirestoreDb } from './firebase-admin';
import {
  createDefaultGenerateMorningBriefDeps,
  type GenerateMorningBriefDeps,
  generateMorningBrief,
} from './generate-morning-brief';
import { invokeIngestRunOnceForTool } from './invoke-ingest-for-internal-tool';
import { callPerplexitySummarizeDelta } from './perplexity-adapter';
import { checkAlertCooldown, insertAlertEvaluationRows } from './persist-alert-evaluation';
import {
  createDefaultExtractDeps,
  type ExtractProcessDeps,
  processExtractSourceContent,
} from './process-extract-source-content';
import {
  createDefaultPromoteDeps,
  type PromoteProcessDeps,
  processPromoteSourceContentSignals,
} from './process-promote-source-content-signals';

const BASE: readonly Omit<InternalToolDescriptor, 'declaration'>[] = [
  {
    name: 'fetch_source',
    description:
      'Triggers one ingest fetch cycle for a single registry source via `POST /internal/run-once` on services/ingest (requires `SIGNAL_TOOL_INGEST_BASE_URL`).',
  },
  {
    name: 'extract_events',
    description:
      'Runs deterministic ExtractedEvent extraction for one SourceContent (`processExtractSourceContent`).',
  },
  {
    name: 'score_signal',
    description:
      'Runs deterministic Signal promotion and scoring for one SourceContent (`processPromoteSourceContentSignals`).',
  },
  {
    name: 'summarize_delta',
    description:
      'Optional enrichment: condenses a delta excerpt via Perplexity when `SIGNAL_PERPLEXITY_ENABLED` + API key are set.',
  },
  {
    name: 'generate_brief',
    description:
      'Deterministic morning brief from `signalsLatest` (`daily_workspace` / `board_digest`); optional Perplexity executive block; persists Firestore + GCS + BigQuery `brief_runs`.',
  },
  {
    name: 'evaluate_alerts',
    description:
      'Evaluates active alert rules against one signal (deterministic AND conditions, cooldown/dedup, persists to BigQuery alert_evaluations).',
  },
];

function resolveDeclaration(
  name: SignalInternalToolName,
  config: IntelRuntimeConfig,
): InternalToolDeclaration {
  switch (name) {
    case 'fetch_source':
      return config.toolIngestBaseUrl && config.toolIngestBaseUrl.trim() !== ''
        ? 'implemented'
        : 'requires_configuration';
    case 'extract_events':
    case 'score_signal':
      return 'implemented';
    case 'summarize_delta':
      return config.perplexityEnabled && config.perplexityApiKey !== null
        ? 'implemented'
        : 'requires_configuration';
    case 'generate_brief':
      return config.briefGenerationEnabled ? 'implemented' : 'requires_configuration';
    case 'evaluate_alerts':
      return config.alertEvaluationEnabled ? 'implemented' : 'requires_configuration';
    default:
      return 'not_implemented';
  }
}

export function listInternalToolDescriptors(config: IntelRuntimeConfig): InternalToolDescriptor[] {
  return BASE.map((row) => ({
    ...row,
    declaration: resolveDeclaration(row.name, config),
  }));
}

export type InternalToolExecutionContext = {
  config: IntelRuntimeConfig;
  extractDeps?: ExtractProcessDeps;
  promoteDeps?: PromoteProcessDeps;
  /** Override for tests; default uses `invokeIngestRunOnceForTool`. */
  fetchIngestRunOnce?: typeof invokeIngestRunOnceForTool;
  /** Override for tests; Perplexity HTTP for `summarize_delta`. */
  perplexityFetch?: typeof fetch;
  /** Override for tests; full morning brief pipeline. */
  generateMorningBriefDeps?: GenerateMorningBriefDeps;
};

function fail(
  tool: SignalInternalToolName,
  error: 'validation' | 'execution' | 'not_implemented' | 'unavailable',
  message: string,
  details?: unknown,
): SignalInternalToolInvokeResult {
  return details !== undefined
    ? { ok: false, tool, error, message, details }
    : { ok: false, tool, error, message };
}

export async function executeSignalInternalTool(
  tool: SignalInternalToolName,
  input: unknown,
  ctx: InternalToolExecutionContext,
): Promise<SignalInternalToolInvokeResult> {
  const { config } = ctx;

  try {
    switch (tool) {
      case 'fetch_source': {
        if (!config.toolIngestBaseUrl || config.toolIngestBaseUrl.trim() === '') {
          return fail(
            tool,
            'unavailable',
            'fetch_source requires SIGNAL_TOOL_INGEST_BASE_URL to call services/ingest',
          );
        }
        const parsed = FetchSourceToolInputSchema.safeParse(input);
        if (!parsed.success) {
          return fail(tool, 'validation', 'invalid_input', parsed.error.flatten());
        }
        const fetcher = ctx.fetchIngestRunOnce ?? invokeIngestRunOnceForTool;
        const res = await fetcher(config, parsed.data);
        const text = await res.text();
        let json: unknown;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          return fail(tool, 'execution', 'ingest_response_not_json', { status: res.status, text });
        }
        if (!res.ok) {
          return fail(tool, 'execution', `ingest_http_${res.status}`, json);
        }
        const out = safeParseInternalToolSuccessOutput(tool, json);
        if (!out.ok) {
          return fail(tool, 'execution', 'ingest_response_shape_mismatch', out.error.flatten());
        }
        return { ok: true, tool, output: out.data };
      }
      case 'extract_events': {
        const parsed = ExtractEventsToolInputSchema.safeParse(input);
        if (!parsed.success) {
          return fail(tool, 'validation', 'invalid_input', parsed.error.flatten());
        }
        const deps = ctx.extractDeps ?? createDefaultExtractDeps(config);
        const raw = await processExtractSourceContent(parsed.data, config, deps);
        const out = safeParseInternalToolSuccessOutput(tool, raw);
        if (!out.ok) {
          return fail(tool, 'execution', 'output_validation_failed', out.error.flatten());
        }
        return { ok: true, tool, output: out.data };
      }
      case 'score_signal': {
        const parsed = ScoreSignalToolInputSchema.safeParse(input);
        if (!parsed.success) {
          return fail(tool, 'validation', 'invalid_input', parsed.error.flatten());
        }
        const deps = ctx.promoteDeps ?? createDefaultPromoteDeps(config);
        const raw = await processPromoteSourceContentSignals(parsed.data, config, deps);
        const out = safeParseInternalToolSuccessOutput(tool, raw);
        if (!out.ok) {
          return fail(tool, 'execution', 'output_validation_failed', out.error.flatten());
        }
        return { ok: true, tool, output: out.data };
      }
      case 'summarize_delta': {
        if (!config.perplexityEnabled || !config.perplexityApiKey) {
          return fail(
            tool,
            'unavailable',
            'summarize_delta requires SIGNAL_PERPLEXITY_ENABLED=true and SIGNAL_PERPLEXITY_API_KEY',
          );
        }
        const parsed = SummarizeDeltaToolInputSchema.safeParse(input);
        if (!parsed.success) {
          return fail(tool, 'validation', 'invalid_input', parsed.error.flatten());
        }
        const pr = await callPerplexitySummarizeDelta(config, parsed.data, {
          fetchImpl: ctx.perplexityFetch,
        });
        if (!pr.ok) {
          return fail(tool, 'execution', pr.message, pr.details);
        }
        const out = safeParseInternalToolSuccessOutput(tool, pr.output);
        if (!out.ok) {
          return fail(tool, 'execution', 'output_validation_failed', out.error.flatten());
        }
        return { ok: true, tool, output: out.data };
      }
      case 'evaluate_alerts': {
        if (!config.alertEvaluationEnabled) {
          return fail(
            tool,
            'unavailable',
            'evaluate_alerts requires SIGNAL_ALERT_EVALUATION_ENABLED=true',
          );
        }
        const parsed = EvaluateAlertsToolInputSchema.safeParse(input);
        if (!parsed.success) {
          return fail(tool, 'validation', 'invalid_input', parsed.error.flatten());
        }
        const signalId = parsed.data.signalId;
        if (!signalId) {
          return fail(tool, 'validation', 'signalId is required for evaluate_alerts');
        }
        const workspaceId = config.defaultWorkspaceId;
        if (!workspaceId) {
          return fail(
            tool,
            'unavailable',
            'SIGNAL_DEFAULT_WORKSPACE_ID required for evaluate_alerts',
          );
        }
        const evalResult = await evaluateAlertsForSignal(
          { workspaceId, signalId, evaluationRunId: parsed.data.evaluationRunId },
          config,
          {
            getFirestoreDb,
            checkCooldown: checkAlertCooldown,
            insertEvaluations: insertAlertEvaluationRows,
          },
        );
        return { ok: true, tool, output: evalResult };
      }
      case 'generate_brief': {
        if (!config.briefGenerationEnabled) {
          return fail(
            tool,
            'unavailable',
            'generate_brief requires SIGNAL_BRIEF_GENERATION_ENABLED=true',
          );
        }
        const parsed = GenerateMorningBriefRequestSchema.safeParse(input);
        if (!parsed.success) {
          return fail(tool, 'validation', 'invalid_input', parsed.error.flatten());
        }
        const workspaceId = parsed.data.workspaceId ?? config.defaultWorkspaceId;
        if (!workspaceId) {
          return fail(
            tool,
            'validation',
            'workspaceId is required (or set SIGNAL_DEFAULT_WORKSPACE_ID)',
          );
        }
        const deps = ctx.generateMorningBriefDeps ?? createDefaultGenerateMorningBriefDeps(config);
        const raw = await generateMorningBrief({ ...parsed.data, workspaceId }, config, deps);
        const out = safeParseInternalToolSuccessOutput(tool, raw);
        if (!out.ok) {
          return fail(tool, 'execution', 'output_validation_failed', out.error.flatten());
        }
        return { ok: true, tool, output: out.data };
      }
      default:
        return fail(tool, 'validation', 'unknown_tool');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    return fail(tool, 'execution', message);
  }
}
