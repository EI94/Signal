import type { IntelRuntimeConfig } from '@signal/config';
import type { LatestSignalDocument } from '@signal/contracts';
import type admin from 'firebase-admin';
import { describe, expect, it, vi } from 'vitest';
import { sendAlertEmail } from './send-alert-email';

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
    resendEnabled: true,
    resendApiKey: 'k',
    resendFromEmail: 'f@x.com',
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

const d = new Date('2026-04-05T12:00:00.000Z');
const signal: LatestSignalDocument = {
  signalId: 's1',
  signalType: 'project_award',
  title: 'Award',
  shortSummary: 'EPC',
  entityRefs: [],
  score: 88,
  status: 'active',
  occurredAt: d,
  detectedAt: d,
  updatedAt: d,
};

describe('sendAlertEmail', () => {
  it('records failure when rule missing', async () => {
    const writeDelivery = vi.fn(async () => {});
    const r = await sendAlertEmail(
      {
        workspaceId: 'ws',
        alertRuleId: 'r1',
        signalId: 's1',
        to: ['a@b.com'],
      },
      cfg(),
      {
        loadRule: async () => null,
        loadSignal: async () => signal,
        sendResend: vi.fn(),
        writeDelivery,
        getFirestore: () => stubDb,
        now: () => new Date(),
        randomId: () => 'id-1',
      },
    );
    expect(r.status).toBe('failed');
    expect(writeDelivery).toHaveBeenCalled();
  });

  it('skips when recipient count exceeds runtime cap', async () => {
    const r = await sendAlertEmail(
      {
        workspaceId: 'ws',
        alertRuleId: 'r1',
        signalId: 's1',
        to: ['a@b.com', 'c@d.com'],
      },
      cfg({ emailMaxRecipientsPerRequest: 1 }),
      {
        loadRule: vi.fn(),
        loadSignal: vi.fn(),
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
});
