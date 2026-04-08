import type { IntelRuntimeConfig } from '@signal/config';
import type { BriefDocument } from '@signal/contracts';
import type admin from 'firebase-admin';
import { describe, expect, it, vi } from 'vitest';
import type { writeEmailDeliveryDocument } from './record-email-delivery';
import { sendBriefEmail } from './send-brief-email';

function cfg(over: Partial<IntelRuntimeConfig> = {}): IntelRuntimeConfig {
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
    alertEvaluationEnabled: false,
    bigQueryAlertEvaluationsTableId: 'ae',
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
    ...over,
  };
}

const stubDb = {} as admin.firestore.Firestore;

const brief: BriefDocument = {
  briefType: 'daily_workspace',
  title: 'Daily',
  periodStart: new Date('2026-04-05T00:00:00.000Z'),
  periodEnd: new Date('2026-04-05T23:59:59.999Z'),
  status: 'ready',
  summaryRef: 'gs://b/path/x.md',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('sendBriefEmail', () => {
  it('skips when resend disabled', async () => {
    const r = await sendBriefEmail({ briefId: 'b1', workspaceId: 'ws', to: ['a@b.com'] }, cfg(), {
      loadBrief: async () => brief,
      downloadBriefBody: vi.fn(),
      loadSignals: vi.fn(async () => []),
      sendResend: vi.fn(),
      writeDelivery: vi.fn(),
      getFirestore: () => stubDb,
      now: () => new Date(),
      randomId: () => 'id-1',
    });
    expect(r.status).toBe('skipped');
  });

  it('skips when recipient count exceeds runtime cap', async () => {
    const r = await sendBriefEmail(
      { briefId: 'b1', workspaceId: 'ws', to: ['a@b.com', 'c@d.com'] },
      cfg({
        resendEnabled: true,
        resendApiKey: 're_x',
        resendFromEmail: 'from@example.com',
        emailMaxRecipientsPerRequest: 1,
      }),
      {
        loadBrief: vi.fn(),
        downloadBriefBody: vi.fn(),
        loadSignals: vi.fn(async () => []),
        sendResend: vi.fn(),
        writeDelivery: vi.fn(),
        getFirestore: () => stubDb,
        now: () => new Date(),
        randomId: () => 'id-cap',
      },
    );
    expect(r.status).toBe('skipped');
    expect(r.skippedReason).toBe('recipient_cap_exceeded');
  });

  it('sends and records on success', async () => {
    const writeDelivery = vi.fn(
      async (_args: Parameters<typeof writeEmailDeliveryDocument>[0]) => {},
    );
    const r = await sendBriefEmail(
      { briefId: 'b1', workspaceId: 'ws', to: ['a@b.com'] },
      cfg({ resendEnabled: true, resendApiKey: 'k', resendFromEmail: 'f@x.com' }),
      {
        loadBrief: async () => brief,
        downloadBriefBody: vi.fn(async () => Buffer.from('# Hello', 'utf8')),
        loadSignals: vi.fn(async () => []),
        sendResend: vi.fn(async () => ({ ok: true as const, providerMessageId: 'pm1' })),
        writeDelivery,
        getFirestore: () => stubDb,
        now: () => new Date('2026-04-05T12:00:00.000Z'),
        randomId: () => 'id-2',
      },
    );
    expect(r.status).toBe('sent');
    expect(writeDelivery).toHaveBeenCalled();
    const firstArg = writeDelivery.mock.calls[0]?.[0];
    expect(firstArg?.doc.status).toBe('sent');
    expect(firstArg?.doc.providerMessageId).toBe('pm1');
    expect(firstArg?.doc.recipientCount).toBe(1);
    expect(firstArg?.doc.recipientDomains).toEqual(['b.com']);
    expect(firstArg?.doc).not.toHaveProperty('recipients');
  });
});
