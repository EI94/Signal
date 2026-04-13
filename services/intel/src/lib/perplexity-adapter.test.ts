import type { IntelRuntimeConfig } from '@signal/config';
import { describe, expect, it, vi } from 'vitest';
import { callPerplexitySummarizeDelta } from './perplexity-adapter';

type FetchInput = Parameters<typeof fetch>[0];

function cfg(overrides: Partial<IntelRuntimeConfig> = {}): IntelRuntimeConfig {
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
    perplexityEnabled: true,
    perplexityApiKey: 'test-key',
    perplexityBaseUrl: 'https://api.perplexity.ai',
    perplexityModel: 'sonar',
    perplexityTimeoutMs: 1000,
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
    ...overrides,
  };
}

const input = {
  title: 'T',
  shortSummary: 'Some text to summarize for the test.',
};

function agentResponseJson(completion: object) {
  return {
    id: 'resp_test',
    object: 'response',
    created_at: 1,
    status: 'completed',
    model: 'perplexity/sonar',
    output: [
      {
        type: 'message',
        id: 'msg_test',
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
  };
}

describe('callPerplexitySummarizeDelta', () => {
  it('returns not_configured when Perplexity is disabled', async () => {
    const r = await callPerplexitySummarizeDelta(
      cfg({ perplexityEnabled: false, perplexityApiKey: null }),
      input,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('perplexity_not_configured');
  });

  it('maps HTTP errors', async () => {
    const fetchImpl = vi.fn(
      async (_input: FetchInput, _init?: RequestInit) =>
        new Response('unauthorized', { status: 401 }),
    );
    const r = await callPerplexitySummarizeDelta(cfg(), input, { fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('perplexity_http_401');
  });

  it('maps timeout via AbortError', async () => {
    const fetchImpl = vi.fn((_input: FetchInput, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    const r = await callPerplexitySummarizeDelta(cfg({ perplexityTimeoutMs: 5 }), input, {
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('perplexity_timeout');
  });

  it('POSTs to Agent API and parses JSON output_text', async () => {
    const body = {
      conciseSummary: 'Short.',
      keyPoints: ['One', 'Two'],
    };
    const fetchImpl = vi.fn(async (url: FetchInput, _init?: RequestInit) => {
      expect(String(url)).toBe('https://api.perplexity.ai/v1/agent');
      return new Response(JSON.stringify(agentResponseJson(body)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const r = await callPerplexitySummarizeDelta(cfg(), input, { fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.output.conciseSummary).toBe('Short.');
      expect(r.output.provider?.id).toBe('perplexity');
      expect(r.output.provider?.model).toBe('perplexity/sonar');
    }
  });

  it('rejects invalid model JSON', async () => {
    const fetchImpl = vi.fn(async (_input: FetchInput, _init?: RequestInit) => {
      return new Response(JSON.stringify(agentResponseJson({ conciseSummary: 'only' })), {
        status: 200,
      });
    });
    const r = await callPerplexitySummarizeDelta(cfg(), input, { fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('perplexity_output_schema_mismatch');
  });
});
