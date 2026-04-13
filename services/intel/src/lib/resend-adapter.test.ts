import type { IntelRuntimeConfig } from '@signal/config';
import { describe, expect, it, vi } from 'vitest';
import { sendEmailViaResend } from './resend-adapter';

function intel(over: Partial<IntelRuntimeConfig> = {}): IntelRuntimeConfig {
  return {
    serviceName: 'intel',
    environment: 'development',
    port: 4002,
    logLevel: 'info',
    version: '0.0.0',
    isProduction: false,
    firebaseProjectId: 'proj',
    gcsRawBucketName: 'b',
    bigQueryDatasetId: 'ds',
    bigQuerySourceContentsTableId: 'sc',
    normalizedWritesEnabled: true,
    intelInternalSecret: null,
    eventExtractionEnabled: false,
    maxNormalizedTextCharsForExtraction: 500_000,
    bigQueryExtractedEventsTableId: 'ee',
    signalPromotionEnabled: false,
    bigQuerySignalsTableId: 's',
    bigQuerySignalScoreHistoryTableId: 'ssh',
    bigQueryEntitySignalLinksTableId: 'esl',
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
    bigQueryAlertEvaluationsTableId: 'ae',
    briefGenerationEnabled: false,
    briefLookbackHours: 48,
    briefEnrichmentEnabled: false,
    briefMaxEnrichmentCalls: 1,
    bigQueryBriefRunsTableId: 'brief_runs',
    userAlertStoryCooldownDays: 7,
    resendEnabled: true,
    resendApiKey: 're_test',
    resendFromEmail: 'from@example.com',
    resendFromName: 'Signal',
    resendReplyTo: null,
    resendTimeoutMs: 5000,
    emailMaxRecipientsPerRequest: 20,
    usageMeteringEnabled: false,
    bigQueryUsageEventsTableId: 'usage_events',
    ...over,
  };
}

describe('sendEmailViaResend', () => {
  it('returns resend_not_configured when disabled', async () => {
    const r = await sendEmailViaResend(
      intel({ resendEnabled: false, resendApiKey: null, resendFromEmail: null }),
      { to: ['a@b.com'], subject: 's', html: '<p>x</p>' },
      { fetchImpl: vi.fn() },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('resend_not_configured');
  });

  it('maps success JSON id', async () => {
    const fetchImpl = vi.fn(
      async (_input: Parameters<typeof fetch>[0], _init?: RequestInit): Promise<Response> =>
        new Response(JSON.stringify({ id: 'email-id-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const r = await sendEmailViaResend(
      intel(),
      { to: ['a@b.com'], subject: 'Sub', html: '<p>hi</p>' },
      { fetchImpl },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.providerMessageId).toBe('email-id-1');
    expect(fetchImpl).toHaveBeenCalled();
    const first = fetchImpl.mock.calls[0];
    expect(first?.[0]).toBe('https://api.resend.com/emails');
    const init = first?.[1] as RequestInit | undefined;
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body)) as { from: string; to: string[] };
    expect(body.from).toContain('from@example.com');
    expect(body.to).toEqual(['a@b.com']);
  });

  it('maps HTTP error body', async () => {
    const r = await sendEmailViaResend(
      intel(),
      { to: ['a@b.com'], subject: 's', html: '<p>x</p>' },
      {
        fetchImpl: vi.fn(
          async () => new Response(JSON.stringify({ message: 'bad request' }), { status: 422 }),
        ),
      },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('bad request');
  });
});
