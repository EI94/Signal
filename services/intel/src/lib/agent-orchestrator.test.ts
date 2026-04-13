import type { IntelRuntimeConfig } from '@signal/config';
import { describe, expect, it, vi } from 'vitest';
import { executeSignalToolRequest } from './agent-orchestrator';
import { executeSignalInternalTool } from './internal-tool-registry';

vi.mock('./internal-tool-registry', () => ({
  executeSignalInternalTool: vi.fn(),
}));

const mockExecute = vi.mocked(executeSignalInternalTool);

function baseConfig(): IntelRuntimeConfig {
  return {
    serviceName: 'intel',
    environment: 'development',
    port: 4002,
    logLevel: 'info',
    version: '0.0.0',
    isProduction: false,
    firebaseProjectId: 'proj',
    gcsRawBucketName: 'b',
    bigQueryDatasetId: 'd',
    bigQuerySourceContentsTableId: 'source_contents',
    normalizedWritesEnabled: true,
    intelInternalSecret: null,
    eventExtractionEnabled: false,
    maxNormalizedTextCharsForExtraction: 500_000,
    bigQueryExtractedEventsTableId: 'extracted_events',
    signalPromotionEnabled: false,
    bigQuerySignalsTableId: 'signals',
    bigQuerySignalScoreHistoryTableId: 'signal_score_history',
    bigQueryEntitySignalLinksTableId: 'entity_signal_links',
    defaultWorkspaceId: 'ws',
    toolIngestBaseUrl: null,
    toolIngestRunOnceSecret: null,
    perplexityEnabled: false,
    perplexityApiKey: null,
    perplexityBaseUrl: 'https://api.perplexity.ai',
    perplexityModel: 'sonar',
    perplexityTimeoutMs: 45_000,
    geminiEnabled: false,
    geminiApiKey: null,
    geminiModel: 'gemini-2.0-flash',
    geminiMaxCallsPerRun: 50,
    alertEvaluationEnabled: false,
    bigQueryAlertEvaluationsTableId: 'alert_evaluations',
    briefGenerationEnabled: false,
    briefLookbackHours: 48,
    briefEnrichmentEnabled: false,
    briefMaxEnrichmentCalls: 1,
    bigQueryBriefRunsTableId: 'brief_runs',
    userAlertStoryCooldownDays: 7,
    resendEnabled: false,
    resendApiKey: null,
    resendFromEmail: null,
    resendFromName: null,
    resendReplyTo: null,
    resendTimeoutMs: 30_000,
    emailMaxRecipientsPerRequest: 20,
    usageMeteringEnabled: false,
    bigQueryUsageEventsTableId: 'usage_events',
  };
}

describe('executeSignalToolRequest', () => {
  it('returns validation_error when the request envelope is invalid', async () => {
    const onExecutionFinish = vi.fn();
    const r = await executeSignalToolRequest(
      { tool: 'not_a_real_tool', input: {} },
      { tool: { config: baseConfig() }, metering: { onExecutionFinish } },
    );
    expect(r.status).toBe('validation_error');
    expect(onExecutionFinish).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'validation_error', durationMs: expect.any(Number) }),
    );
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('delegates to the registry and returns success with output guardrail', async () => {
    mockExecute.mockResolvedValue({
      ok: true,
      tool: 'extract_events',
      output: { ok: true, skipped: true, reason: 'extraction_disabled' },
    });
    const onExecutionStart = vi.fn();
    const onExecutionFinish = vi.fn();
    const r = await executeSignalToolRequest(
      {
        tool: 'extract_events',
        input: {},
        correlationId: 'c1',
      },
      {
        tool: { config: baseConfig() },
        metering: { onExecutionStart, onExecutionFinish },
      },
    );
    expect(r.status).toBe('success');
    if (r.status === 'success') {
      expect(r.output).toEqual({ ok: true, skipped: true, reason: 'extraction_disabled' });
      expect(r.usage?.outcome).toBe('success');
    }
    expect(onExecutionStart).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'extract_events', correlationId: 'c1' }),
    );
    expect(onExecutionFinish).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'extract_events', status: 'success' }),
    );
    expect(mockExecute).toHaveBeenCalledWith('extract_events', {}, expect.any(Object));
  });

  it('maps registry not_implemented to response', async () => {
    mockExecute.mockResolvedValue({
      ok: false,
      tool: 'generate_brief',
      error: 'not_implemented',
      message: 'capability_not_implemented_in_this_repository',
    });
    const r = await executeSignalToolRequest(
      { tool: 'generate_brief', input: {} },
      { tool: { config: baseConfig() } },
    );
    expect(r.status).toBe('not_implemented');
  });

  it('maps registry unavailable to response', async () => {
    mockExecute.mockResolvedValue({
      ok: false,
      tool: 'fetch_source',
      error: 'unavailable',
      message: 'no base url',
    });
    const r = await executeSignalToolRequest(
      { tool: 'fetch_source', input: { sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' } },
      { tool: { config: baseConfig() } },
    );
    expect(r.status).toBe('unavailable');
  });

  it('returns execution_error when registry reports success but output fails guardrail', async () => {
    mockExecute.mockResolvedValue({
      ok: true,
      tool: 'extract_events',
      output: { completely: 'invalid' },
    });
    const r = await executeSignalToolRequest(
      { tool: 'extract_events', input: {} },
      { tool: { config: baseConfig() } },
    );
    expect(r.status).toBe('execution_error');
    if (r.status === 'execution_error') {
      expect(r.error.code).toBe('output_validation_failed');
    }
  });
});
