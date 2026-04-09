import type { IntelRuntimeConfig } from '@signal/config';
import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultProcessDeps,
  type ProcessPersistDeps,
  processSourceContentPersisted,
} from './process-source-content-persisted';

const sourceId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const sourceContentId = 'ab'.repeat(16);

function baseEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    eventType: 'source_content.persisted',
    eventVersion: 'v1',
    sourceContentId,
    sourceId,
    registrySourceType: 'web_page',
    sourceType: 'web_page',
    sourceUrl: 'https://example.com',
    observedAt: '2026-04-04T12:00:00.000Z',
    archivedGcsUri: 'gs://b/raw/source/x/date=2026-04-04/ab.html',
    manifestGcsUri: 'gs://b/manifests/source/x/date=2026-04-04/ab.manifest.json',
    contentHash: 'cd'.repeat(32),
    mimeType: 'text/html',
    language: null,
    workspaceId: null,
    publishedAt: null,
    emittedAt: '2026-04-04T12:00:01.000Z',
    ...overrides,
  };
}

function manifestBody(overrides: { rawKey?: string } = {}) {
  const rawKey = overrides.rawKey ?? 'raw/source/x/date=2026-04-04/ab.html';
  return JSON.stringify({
    schema_version: 'gcs-archive-manifest-v1',
    source_id: sourceId,
    source_content_id: sourceContentId,
    observed_date: '2026-04-04',
    artifacts: [
      {
        kind: 'raw',
        relative_key: rawKey,
        content_type: 'text/html',
        sha256_hex: 'a'.repeat(64),
      },
    ],
  });
}

function intelConfig(overrides: Partial<IntelRuntimeConfig> = {}): IntelRuntimeConfig {
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

describe('processSourceContentPersisted', () => {
  it('validates manifest raw uri and writes normalized + BQ status', async () => {
    const downloadBytes = vi.fn(async (_bucket: string, key: string) => {
      if (key.endsWith('.manifest.json')) {
        return Buffer.from(manifestBody(), 'utf8');
      }
      return Buffer.from('<html>x</html>', 'utf8');
    });
    const uploadNormalized = vi.fn().mockResolvedValue(undefined);
    const updateExtractionRow = vi.fn().mockResolvedValue(undefined);

    const deps: ProcessPersistDeps = { downloadBytes, uploadNormalized, updateExtractionRow };

    const result = await processSourceContentPersisted(baseEvent() as never, intelConfig(), deps);

    expect(result.extractionStatus).toBe('normalized_ready');
    const normFile = `${sourceContentId}.txt`;
    expect(result.normalizedGcsUri).toBe(
      `gs://b/normalized/source/3fa85f64-5717-4562-b3fc-2c963f66afa6/date=2026-04-04/${normFile}`,
    );
    expect(uploadNormalized).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'b',
        objectKey: `normalized/source/3fa85f64-5717-4562-b3fc-2c963f66afa6/date=2026-04-04/${normFile}`,
      }),
    );
    expect(updateExtractionRow).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionStatus: 'normalized_ready',
        normalizedGcsUri: result.normalizedGcsUri,
      }),
    );
  });

  it('sets awaiting_pdf_text_extraction for PDF without upload', async () => {
    const downloadBytes = vi.fn(async (_b: string, key: string) => {
      if (key.endsWith('.manifest.json')) {
        return Buffer.from(manifestBody({ rawKey: 'raw/source/x/date=2026-04-04/ab.pdf' }), 'utf8');
      }
      return Buffer.from('%PDF-1.4', 'utf8');
    });
    const uploadNormalized = vi.fn();
    const updateExtractionRow = vi.fn().mockResolvedValue(undefined);
    const deps: ProcessPersistDeps = { downloadBytes, uploadNormalized, updateExtractionRow };

    const result = await processSourceContentPersisted(
      {
        ...baseEvent({
          archivedGcsUri: 'gs://b/raw/source/x/date=2026-04-04/ab.pdf',
          mimeType: 'application/pdf',
          sourceType: 'pdf_document',
        }),
      } as never,
      intelConfig(),
      deps,
    );

    expect(result.extractionStatus).toBe('awaiting_pdf_text_extraction');
    expect(uploadNormalized).not.toHaveBeenCalled();
  });

  it('skips normalized write when disabled', async () => {
    const downloadBytes = vi.fn(async (_b: string, key: string) => {
      if (key.endsWith('.manifest.json')) {
        return Buffer.from(manifestBody(), 'utf8');
      }
      return Buffer.from('hi', 'utf8');
    });
    const uploadNormalized = vi.fn();
    const updateExtractionRow = vi.fn().mockResolvedValue(undefined);
    const deps: ProcessPersistDeps = { downloadBytes, uploadNormalized, updateExtractionRow };

    const result = await processSourceContentPersisted(
      baseEvent() as never,
      intelConfig({ normalizedWritesEnabled: false }),
      deps,
    );

    expect(result.extractionStatus).toBe('normalization_skipped');
    expect(result.extractionErrorCode).toBe('intel_normalized_writes_disabled');
    expect(uploadNormalized).not.toHaveBeenCalled();
  });

  it('throws when manifest raw key does not match archived uri', async () => {
    const downloadBytes = vi.fn(async (_b: string, key: string) => {
      if (key.endsWith('.manifest.json')) {
        return Buffer.from(manifestBody({ rawKey: 'wrong/path.html' }), 'utf8');
      }
      return Buffer.from('x', 'utf8');
    });
    const deps: ProcessPersistDeps = {
      downloadBytes,
      uploadNormalized: vi.fn(),
      updateExtractionRow: vi.fn(),
    };

    await expect(
      processSourceContentPersisted(baseEvent() as never, intelConfig(), deps),
    ).rejects.toThrow(/manifest_raw_uri_mismatch/);
  });
});

describe('createDefaultProcessDeps', () => {
  it('returns callables', () => {
    const deps = createDefaultProcessDeps(intelConfig());
    expect(typeof deps.downloadBytes).toBe('function');
    expect(typeof deps.uploadNormalized).toBe('function');
    expect(typeof deps.updateExtractionRow).toBe('function');
  });
});
