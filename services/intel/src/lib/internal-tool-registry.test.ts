import type { IntelRuntimeConfig } from '@signal/config';
import type { MorningBriefGenerationResult } from '@signal/contracts';
import { describe, expect, it, vi } from 'vitest';
import { executeSignalInternalTool, listInternalToolDescriptors } from './internal-tool-registry';

function intel(overrides: Partial<IntelRuntimeConfig> = {}): IntelRuntimeConfig {
  return {
    serviceName: 'intel',
    environment: 'development',
    port: 4002,
    logLevel: 'info',
    version: '0.0.0',
    isProduction: false,
    firebaseProjectId: 'proj',
    gcsRawBucketName: 'b',
    bigQueryDatasetId: 'signal_dev_analytics',
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
    defaultWorkspaceId: 'ws-default',
    toolIngestBaseUrl: null,
    toolIngestRunOnceSecret: null,
    perplexityEnabled: false,
    perplexityApiKey: null,
    perplexityBaseUrl: 'https://api.perplexity.ai',
    perplexityModel: 'sonar',
    perplexityTimeoutMs: 45_000,
    alertEvaluationEnabled: false,
    bigQueryAlertEvaluationsTableId: 'alert_evaluations',
    briefGenerationEnabled: false,
    briefLookbackHours: 48,
    briefEnrichmentEnabled: false,
    briefMaxEnrichmentCalls: 1,
    bigQueryBriefRunsTableId: 'brief_runs',
    resendEnabled: false,
    resendApiKey: null,
    resendFromEmail: null,
    resendFromName: null,
    resendReplyTo: null,
    resendTimeoutMs: 30_000,
    emailMaxRecipientsPerRequest: 20,
    usageMeteringEnabled: false,
    bigQueryUsageEventsTableId: 'usage_events',
    ...overrides,
  };
}

const summarizeBody = {
  title: 'Quarterly update',
  shortSummary: 'Revenue increased 10% year over year in the reported period.',
  sourceContentId: 'aa'.repeat(16),
};

const validRunOnceJson = () => ({
  ok: true as const,
  runAt: '2026-04-04T12:00:00.000Z',
  summary: {
    processed: 1,
    unchanged: 0,
    changed: 0,
    firstSeen: 1,
    failed: 0,
    skipped: 0,
    archived: 0,
    persisted: 0,
    persistSkipped: 0,
    persistFailed: 0,
    published: 0,
    publishFailed: 0,
    publishSkipped: 0,
    skippedRatePolicy: 0,
    maxSourcesPerRunApplied: null,
    sourcesOmittedByCap: 0,
  },
});

const extractBody = {
  sourceContentId: 'ab'.repeat(16),
  sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  normalizedGcsUri: 'gs://b/normalized/k.txt',
  observedAt: '2026-04-04T12:00:00.000Z',
  publishedAt: null,
  linkedEntityRefs: [],
};

const promoteBody = {
  sourceContentId: 'cc'.repeat(16),
  observedAt: '2026-04-01T12:00:00.000Z',
};

describe('listInternalToolDescriptors', () => {
  it('marks fetch_source as requires_configuration when ingest URL unset', () => {
    const rows = listInternalToolDescriptors(intel());
    const fetchRow = rows.find((r) => r.name === 'fetch_source');
    expect(fetchRow?.declaration).toBe('requires_configuration');
  });

  it('marks fetch_source implemented when ingest URL is set', () => {
    const rows = listInternalToolDescriptors(intel({ toolIngestBaseUrl: 'http://localhost:4001' }));
    expect(rows.find((r) => r.name === 'fetch_source')?.declaration).toBe('implemented');
  });

  it('marks summarize_delta as requires_configuration when Perplexity is off', () => {
    const rows = listInternalToolDescriptors(intel());
    expect(rows.find((r) => r.name === 'summarize_delta')?.declaration).toBe(
      'requires_configuration',
    );
  });

  it('marks summarize_delta implemented when Perplexity is enabled', () => {
    const rows = listInternalToolDescriptors(
      intel({ perplexityEnabled: true, perplexityApiKey: 'secret' }),
    );
    expect(rows.find((r) => r.name === 'summarize_delta')?.declaration).toBe('implemented');
  });

  it('marks generate_brief as requires_configuration when disabled', () => {
    const rows = listInternalToolDescriptors(intel());
    expect(rows.find((r) => r.name === 'generate_brief')?.declaration).toBe(
      'requires_configuration',
    );
  });

  it('marks generate_brief implemented when enabled', () => {
    const rows = listInternalToolDescriptors(intel({ briefGenerationEnabled: true }));
    expect(rows.find((r) => r.name === 'generate_brief')?.declaration).toBe('implemented');
  });

  it('marks evaluate_alerts as requires_configuration when disabled', () => {
    const rows = listInternalToolDescriptors(intel({ alertEvaluationEnabled: false }));
    expect(rows.find((r) => r.name === 'evaluate_alerts')?.declaration).toBe(
      'requires_configuration',
    );
  });

  it('marks evaluate_alerts as implemented when enabled', () => {
    const rows = listInternalToolDescriptors(intel({ alertEvaluationEnabled: true }));
    expect(rows.find((r) => r.name === 'evaluate_alerts')?.declaration).toBe('implemented');
  });
});

describe('executeSignalInternalTool', () => {
  it('returns unavailable when fetch_source has no ingest base URL', async () => {
    const r = await executeSignalInternalTool(
      'fetch_source',
      { sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
      { config: intel() },
    );
    expect(r).toEqual(
      expect.objectContaining({
        ok: false,
        tool: 'fetch_source',
        error: 'unavailable',
      }),
    );
  });

  it('validates fetch_source input', async () => {
    const r = await executeSignalInternalTool(
      'fetch_source',
      { sourceId: 'bad' },
      { config: intel({ toolIngestBaseUrl: 'http://localhost:4001' }) },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('validation');
  });

  it('calls ingest via override and returns validated output', async () => {
    const fetchIngestRunOnce = vi.fn(async () => {
      return new Response(JSON.stringify(validRunOnceJson()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const r = await executeSignalInternalTool(
      'fetch_source',
      { sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
      {
        config: intel({ toolIngestBaseUrl: 'http://localhost:4001' }),
        fetchIngestRunOnce,
      },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.output).toMatchObject({ ok: true, summary: expect.any(Object) });
    expect(fetchIngestRunOnce).toHaveBeenCalled();
  });

  it('returns execution error when ingest HTTP fails', async () => {
    const r = await executeSignalInternalTool(
      'fetch_source',
      { sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
      {
        config: intel({ toolIngestBaseUrl: 'http://localhost:4001' }),
        fetchIngestRunOnce: vi.fn(async () => new Response('nope', { status: 502 })),
      },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('execution');
  });

  it('routes extract_events to processExtractSourceContent (skipped when extraction off)', async () => {
    const r = await executeSignalInternalTool('extract_events', extractBody, {
      config: intel(),
    });
    expect(r).toEqual({
      ok: true,
      tool: 'extract_events',
      output: { ok: true, skipped: true, reason: 'extraction_disabled' },
    });
  });

  it('routes score_signal to processPromoteSourceContentSignals (skipped when promotion off)', async () => {
    const r = await executeSignalInternalTool('score_signal', promoteBody, {
      config: intel(),
    });
    expect(r).toEqual({
      ok: true,
      tool: 'score_signal',
      output: { ok: true, skipped: true, reason: 'promotion_disabled' },
    });
  });

  it('returns unavailable for summarize_delta when Perplexity is not configured', async () => {
    const r = await executeSignalInternalTool('summarize_delta', summarizeBody, {
      config: intel(),
    });
    expect(r).toEqual(
      expect.objectContaining({
        ok: false,
        tool: 'summarize_delta',
        error: 'unavailable',
      }),
    );
  });

  it('validates summarize_delta input', async () => {
    const r = await executeSignalInternalTool(
      'summarize_delta',
      { title: '', shortSummary: 'x' },
      { config: intel({ perplexityEnabled: true, perplexityApiKey: 'k' }) },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('validation');
  });

  it('calls Perplexity via fetch override and returns strict output', async () => {
    const completion = {
      conciseSummary: 'Revenue grew.',
      keyPoints: ['Up 10%', 'YoY comparison'],
    };
    const perplexityFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          id: 'resp_t',
          object: 'response',
          created_at: 1,
          status: 'completed',
          model: 'perplexity/sonar',
          output: [
            {
              type: 'message',
              id: 'msg_t',
              status: 'completed',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify(completion),
                  annotations: [],
                  logprobs: [],
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const r = await executeSignalInternalTool('summarize_delta', summarizeBody, {
      config: intel({ perplexityEnabled: true, perplexityApiKey: 'k' }),
      perplexityFetch,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.output).toMatchObject({
        conciseSummary: 'Revenue grew.',
        keyPoints: ['Up 10%', 'YoY comparison'],
        provider: { id: 'perplexity', model: 'perplexity/sonar' },
      });
    }
    expect(perplexityFetch).toHaveBeenCalled();
  });

  it('returns execution error when Perplexity HTTP fails', async () => {
    const r = await executeSignalInternalTool('summarize_delta', summarizeBody, {
      config: intel({ perplexityEnabled: true, perplexityApiKey: 'k' }),
      perplexityFetch: vi.fn(async () => new Response('err', { status: 401 })),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('execution');
      expect(r.message).toMatch(/perplexity_http_401/);
    }
  });

  it('returns unavailable for generate_brief when disabled', async () => {
    const r = await executeSignalInternalTool(
      'generate_brief',
      { briefType: 'daily_workspace' },
      { config: intel() },
    );
    expect(r).toEqual(
      expect.objectContaining({
        ok: false,
        tool: 'generate_brief',
        error: 'unavailable',
      }),
    );
  });

  it('runs generate_brief with mocked deps', async () => {
    const r = await executeSignalInternalTool(
      'generate_brief',
      { briefType: 'daily_workspace', workspaceId: 'ws-1' },
      {
        config: intel({ briefGenerationEnabled: true, defaultWorkspaceId: 'ws-1' }),
        generateMorningBriefDeps: {
          loadSignals: vi.fn(async () => []),
          uploadMarkdown: vi.fn(async () => {}),
          writeBriefDoc: vi.fn(async () => {}),
          insertBriefRun: vi.fn(async () => {}),
          now: () => new Date('2026-04-05T12:00:00.000Z'),
          randomId: () => 'brief-id-fixed',
        },
      },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const out = r.output as MorningBriefGenerationResult;
      expect(out.briefId).toBe('brief-id-fixed');
      expect(out.workspaceId).toBe('ws-1');
    }
  });

  it('returns unavailable for evaluate_alerts when disabled', async () => {
    const r = await executeSignalInternalTool('evaluate_alerts', {}, { config: intel() });
    expect(r).toEqual(
      expect.objectContaining({
        ok: false,
        tool: 'evaluate_alerts',
        error: 'unavailable',
      }),
    );
  });
});
