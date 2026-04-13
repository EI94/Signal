import type { IntelRuntimeConfig } from '@signal/config';
import type { ExtractSourceContentRequest } from '@signal/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultExtractDeps,
  type ExtractProcessDeps,
  processExtractSourceContent,
} from './process-extract-source-content';

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
    eventExtractionEnabled: true,
    maxNormalizedTextCharsForExtraction: 500_000,
    bigQueryExtractedEventsTableId: 'extracted_events',
    signalPromotionEnabled: false,
    bigQuerySignalsTableId: 'signals',
    bigQuerySignalScoreHistoryTableId: 'signal_score_history',
    bigQueryEntitySignalLinksTableId: 'entity_signal_links',
    defaultWorkspaceId: null,
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
    ...overrides,
  } as IntelRuntimeConfig;
}

const baseBody: ExtractSourceContentRequest = {
  sourceContentId: 'ab'.repeat(16),
  sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  normalizedGcsUri: 'gs://b/normalized/k.txt',
  observedAt: '2026-04-04T12:00:00.000Z',
  publishedAt: null,
  linkedEntityRefs: [],
};

function mockDeps(overrides: Partial<ExtractProcessDeps> = {}): ExtractProcessDeps {
  return {
    downloadBytes: vi
      .fn()
      .mockResolvedValue(Buffer.from('We announce quarterly results today.', 'utf8')),
    deleteExtractedForSourceContent: vi.fn().mockResolvedValue(undefined),
    insertExtractedRows: vi.fn().mockResolvedValue(undefined),
    updateSourceContentRow: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('processExtractSourceContent', () => {
  it('skips when extraction disabled', async () => {
    const r = await processExtractSourceContent(
      baseBody,
      intel({ eventExtractionEnabled: false }),
      mockDeps(),
    );
    expect(r.skipped).toBe(true);
  });

  it('runs delete, insert, update with counts when keywords match', async () => {
    const deps = mockDeps();
    const result = await processExtractSourceContent(baseBody, intel(), deps);
    expect(result.skipped).toBe(false);
    if (!result.skipped) {
      expect(result.extractedEventCount).toBeGreaterThanOrEqual(1);
      expect(result.extractionStatus).toBe('extracted_ready');
    }
    expect(deps.deleteExtractedForSourceContent).toHaveBeenCalledTimes(1);
    expect(deps.insertExtractedRows).toHaveBeenCalledTimes(1);
    expect(deps.updateSourceContentRow).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionStatus: 'extracted_ready',
        extractedEventCount: expect.any(Number),
      }),
    );
  });

  it('sets no_events_detected when text has no keyword hits', async () => {
    const deps = mockDeps({
      downloadBytes: vi.fn().mockResolvedValue(Buffer.from('lorem ipsum only', 'utf8')),
    });
    const result = await processExtractSourceContent(baseBody, intel(), deps);
    expect(result.skipped).toBe(false);
    if (!result.skipped) {
      expect(result.extractedEventCount).toBe(0);
      expect(result.extractionStatus).toBe('no_events_detected');
    }
  });

  it('marks extraction_failed on update when insert throws', async () => {
    const deps = mockDeps({
      insertExtractedRows: vi.fn().mockRejectedValue(new Error('bq insert failed')),
      updateSourceContentRow: vi.fn().mockResolvedValue(undefined),
    });
    await expect(processExtractSourceContent(baseBody, intel(), deps)).rejects.toThrow(
      'bq insert failed',
    );
    expect(deps.updateSourceContentRow).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionStatus: 'extraction_failed',
        extractedEventCount: null,
      }),
    );
  });
});

describe('createDefaultExtractDeps', () => {
  it('returns all callables', () => {
    const d = createDefaultExtractDeps(intel());
    expect(typeof d.downloadBytes).toBe('function');
    expect(typeof d.deleteExtractedForSourceContent).toBe('function');
    expect(typeof d.insertExtractedRows).toBe('function');
    expect(typeof d.updateSourceContentRow).toBe('function');
  });
});
