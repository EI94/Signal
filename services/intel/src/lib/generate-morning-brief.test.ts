import type { IntelRuntimeConfig } from '@signal/config';
import type { BriefRunRow } from '@signal/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  buildSummarizeDeltaInputForExecutiveBlock,
  formatExecutiveBlockFromSummarizeDelta,
  generateMorningBrief,
  resolveUtcReportingPeriod,
} from './generate-morning-brief';

function intel(over: Partial<IntelRuntimeConfig> = {}): IntelRuntimeConfig {
  return {
    serviceName: 'intel',
    environment: 'development',
    port: 4002,
    logLevel: 'info',
    version: '0.0.0',
    isProduction: false,
    firebaseProjectId: 'proj',
    gcsRawBucketName: 'bucket',
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
    briefGenerationEnabled: true,
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
    ...over,
  };
}

describe('resolveUtcReportingPeriod', () => {
  it('defaults to UTC calendar day of now', () => {
    const now = new Date(Date.UTC(2026, 3, 5, 15, 0, 0, 0));
    const r = resolveUtcReportingPeriod({ periodDate: undefined, now });
    expect(r.periodDateStr).toBe('2026-04-05');
    expect(r.periodStart.toISOString()).toBe('2026-04-05T00:00:00.000Z');
  });
});

describe('formatExecutiveBlockFromSummarizeDelta', () => {
  it('renders concise summary and bullets', () => {
    const s = formatExecutiveBlockFromSummarizeDelta({
      conciseSummary: 'Summary line.',
      keyPoints: ['A', 'B'],
    });
    expect(s).toContain('Summary line.');
    expect(s).toContain('- A');
    expect(s).toContain('- B');
  });
});

describe('buildSummarizeDeltaInputForExecutiveBlock', () => {
  it('builds bounded deterministic excerpt', () => {
    const d = new Date('2026-04-05T12:00:00.000Z');
    const input = buildSummarizeDeltaInputForExecutiveBlock({
      workspaceId: 'ws',
      periodDateStr: '2026-04-05',
      briefType: 'daily_workspace',
      signals: [
        {
          signalId: 'x',
          signalType: 't',
          title: 'Hello',
          shortSummary: 'More',
          entityRefs: [],
          score: 80,
          status: 'active',
          occurredAt: d,
          detectedAt: d,
          updatedAt: d,
        },
      ],
      maxChars: 10_000,
    });
    expect(input.shortSummary).toContain('Hello');
    expect(input.title).toContain('Morning brief executive view');
  });
});

describe('generateMorningBrief', () => {
  it('persists via deps and skips enrichment when disabled', async () => {
    const uploadMarkdown = vi.fn(async () => {});
    const writeBriefDoc = vi.fn(async () => {});
    const insertBriefRun = vi.fn(async (_row: BriefRunRow) => {});
    const r = await generateMorningBrief(
      { briefType: 'daily_workspace', workspaceId: 'ws', periodDate: '2026-04-05' },
      intel({ briefEnrichmentEnabled: false }),
      {
        loadSignals: async () => [],
        uploadMarkdown,
        writeBriefDoc,
        insertBriefRun,
        now: () => new Date('2026-04-05T10:00:00.000Z'),
        randomId: () => 'id-1',
      },
    );
    expect(r.briefId).toBe('id-1');
    expect(r.modelAssisted).toBe(false);
    expect(uploadMarkdown).toHaveBeenCalled();
    expect(writeBriefDoc).toHaveBeenCalled();
    expect(insertBriefRun).toHaveBeenCalled();
    const runArg = insertBriefRun.mock.calls[0]?.[0] as BriefRunRow | undefined;
    expect(runArg).toBeDefined();
    expect(runArg?.brief_run_id).toBe('id-1');
    expect(runArg?.model_assisted).toBe(false);
  });

  it('does not call enrichExecutive when briefMaxEnrichmentCalls is 0', async () => {
    const enrichExecutive = vi.fn();
    const r = await generateMorningBrief(
      { briefType: 'daily_workspace', workspaceId: 'ws', periodDate: '2026-04-05' },
      intel({
        briefEnrichmentEnabled: true,
        perplexityEnabled: true,
        perplexityApiKey: 'k',
        briefMaxEnrichmentCalls: 0,
      }),
      {
        loadSignals: async () => [
          {
            signalId: 's1',
            signalType: 't',
            title: 'A',
            entityRefs: [],
            score: 80,
            status: 'active',
            occurredAt: new Date('2026-04-05T08:00:00.000Z'),
            detectedAt: new Date('2026-04-05T08:00:00.000Z'),
            updatedAt: new Date('2026-04-05T08:00:00.000Z'),
          },
        ],
        uploadMarkdown: vi.fn(async () => {}),
        writeBriefDoc: vi.fn(async () => {}),
        insertBriefRun: vi.fn(async () => {}),
        enrichExecutive,
        now: () => new Date('2026-04-05T10:00:00.000Z'),
        randomId: () => 'id-0',
      },
    );
    expect(enrichExecutive).not.toHaveBeenCalled();
    expect(r.modelAssisted).toBe(false);
  });

  it('sets modelAssisted when enrichment succeeds', async () => {
    const r = await generateMorningBrief(
      { briefType: 'daily_workspace', workspaceId: 'ws', periodDate: '2026-04-05' },
      intel({
        briefEnrichmentEnabled: true,
        perplexityEnabled: true,
        perplexityApiKey: 'k',
      }),
      {
        loadSignals: async () => [
          {
            signalId: 's1',
            signalType: 't',
            title: 'A',
            entityRefs: [],
            score: 80,
            status: 'active',
            occurredAt: new Date('2026-04-05T08:00:00.000Z'),
            detectedAt: new Date('2026-04-05T08:00:00.000Z'),
            updatedAt: new Date('2026-04-05T08:00:00.000Z'),
          },
        ],
        uploadMarkdown: vi.fn(async () => {}),
        writeBriefDoc: vi.fn(async () => {}),
        insertBriefRun: vi.fn(async () => {}),
        enrichExecutive: async () => ({
          ok: true,
          output: {
            conciseSummary: 'X',
            keyPoints: ['y'],
            provider: { id: 'perplexity' as const, model: 'm' },
          },
        }),
        now: () => new Date('2026-04-05T10:00:00.000Z'),
        randomId: () => 'id-2',
      },
    );
    expect(r.modelAssisted).toBe(true);
  });

  it('does not fail when enrichment returns ok: false', async () => {
    const r = await generateMorningBrief(
      { briefType: 'daily_workspace', workspaceId: 'ws', periodDate: '2026-04-05' },
      intel({
        briefEnrichmentEnabled: true,
        perplexityEnabled: true,
        perplexityApiKey: 'k',
      }),
      {
        loadSignals: async () => [
          {
            signalId: 's1',
            signalType: 't',
            title: 'A',
            entityRefs: [],
            score: 80,
            status: 'active',
            occurredAt: new Date('2026-04-05T08:00:00.000Z'),
            detectedAt: new Date('2026-04-05T08:00:00.000Z'),
            updatedAt: new Date('2026-04-05T08:00:00.000Z'),
          },
        ],
        uploadMarkdown: vi.fn(async () => {}),
        writeBriefDoc: vi.fn(async () => {}),
        insertBriefRun: vi.fn(async () => {}),
        enrichExecutive: async () => ({ ok: false, message: 'fail' }),
        now: () => new Date('2026-04-05T10:00:00.000Z'),
        randomId: () => 'id-3',
      },
    );
    expect(r.modelAssisted).toBe(false);
  });
});
