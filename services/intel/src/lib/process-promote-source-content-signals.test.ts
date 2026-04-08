import type { IntelRuntimeConfig } from '@signal/config';
import type { ExtractedEventRow, PromoteSourceContentSignalsRequest } from '@signal/contracts';
import { SIGNAL_PROMOTION_SCORING_VERSION } from '@signal/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  type PromoteProcessDeps,
  processPromoteSourceContentSignals,
} from './process-promote-source-content-signals';

const baseConfig = {
  serviceName: 'intel' as const,
  environment: 'development' as const,
  port: 4002,
  logLevel: 'info' as const,
  version: '0.0.0',
  isProduction: false,
  firebaseProjectId: 'p',
  gcsRawBucketName: 'b',
  bigQueryDatasetId: 'd',
  bigQuerySourceContentsTableId: 'source_contents',
  normalizedWritesEnabled: true,
  intelInternalSecret: null,
  eventExtractionEnabled: false,
  maxNormalizedTextCharsForExtraction: 500_000,
  bigQueryExtractedEventsTableId: 'extracted_events',
  signalPromotionEnabled: true,
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
} satisfies IntelRuntimeConfig;

const sampleEvent = (id: string): ExtractedEventRow => ({
  extracted_event_id: id,
  event_family: 'project_award',
  event_time: new Date('2026-01-02T00:00:00Z'),
  event_time_precision: 'day',
  confidence: 70,
  ambiguity_notes: null,
  evidence_source_content_ids: ['cc'.repeat(16)],
  extracted_facts_json: { extractor: 'x' },
  linked_entity_refs_json: [{ entityType: 'company', entityId: 'e1' }],
  created_at: new Date('2026-01-02T01:00:00Z'),
});

describe('processPromoteSourceContentSignals', () => {
  it('skips when promotion disabled', async () => {
    const deps = emptyDeps();
    const body = req();
    const r = await processPromoteSourceContentSignals(
      body,
      { ...baseConfig, signalPromotionEnabled: false },
      deps,
    );
    expect(r).toEqual({ ok: true, skipped: true, reason: 'promotion_disabled' });
    expect(deps.queryExtractedEvents).not.toHaveBeenCalled();
  });

  it('skips when no extracted events in BigQuery', async () => {
    const deps = emptyDeps();
    deps.queryExtractedEvents.mockResolvedValue([]);
    const r = await processPromoteSourceContentSignals(body, baseConfig, deps);
    expect(r).toEqual({ ok: true, skipped: true, reason: 'no_extracted_events' });
    expect(deps.deleteSignalArtifacts).not.toHaveBeenCalled();
  });

  it('promotes with delete→insert idempotency and updates status', async () => {
    const ev = sampleEvent('f'.repeat(32));
    const deps = emptyDeps();
    deps.queryExtractedEvents.mockResolvedValue([ev]);

    const r = await processPromoteSourceContentSignals(body, baseConfig, deps);

    expect(r.ok && !r.skipped && r.promotedSignalCount).toBe(1);
    expect(deps.deleteSignalArtifacts).toHaveBeenCalledTimes(1);
    expect(deps.deleteSignalArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({
        scoringVersion: SIGNAL_PROMOTION_SCORING_VERSION,
      }),
    );
    expect(deps.insertAnalyticalRows).toHaveBeenCalledTimes(1);
    expect(deps.writeLatestProjection).toHaveBeenCalledTimes(1);
    expect(deps.updatePromotionStatus).toHaveBeenCalledWith(
      expect.objectContaining({ extractionStatus: 'promoted_ready', extractionErrorCode: null }),
    );
  });

  it('is idempotent on second run (same delete+insert pattern)', async () => {
    const ev = sampleEvent('a'.repeat(32));
    const deps = emptyDeps();
    deps.queryExtractedEvents.mockResolvedValue([ev]);
    await processPromoteSourceContentSignals(body, baseConfig, deps);
    await processPromoteSourceContentSignals(body, baseConfig, deps);
    expect(deps.deleteSignalArtifacts).toHaveBeenCalledTimes(2);
    expect(deps.insertAnalyticalRows).toHaveBeenCalledTimes(2);
  });

  it('patches promotion_failed on error', async () => {
    const deps = emptyDeps();
    deps.queryExtractedEvents.mockResolvedValue([sampleEvent('b'.repeat(32))]);
    deps.insertAnalyticalRows.mockRejectedValue(new Error('bq_insert_failed'));

    await expect(processPromoteSourceContentSignals(body, baseConfig, deps)).rejects.toThrow(
      'bq_insert_failed',
    );
    expect(deps.updatePromotionStatus).toHaveBeenCalledWith(
      expect.objectContaining({ extractionStatus: 'promotion_failed' }),
    );
  });

  it('throws when workspace is missing', async () => {
    const deps = emptyDeps();
    await expect(
      processPromoteSourceContentSignals(body, { ...baseConfig, defaultWorkspaceId: null }, deps),
    ).rejects.toThrow(/workspace_id_required/);
  });
});

const body: PromoteSourceContentSignalsRequest = {
  sourceContentId: 'cc'.repeat(16),
  observedAt: new Date('2026-04-01T12:00:00Z').toISOString(),
};

function req(): PromoteSourceContentSignalsRequest {
  return { ...body };
}

function emptyDeps() {
  return {
    queryExtractedEvents: vi.fn(),
    deleteSignalArtifacts: vi.fn(),
    insertAnalyticalRows: vi.fn(),
    writeLatestProjection: vi.fn(),
    updatePromotionStatus: vi.fn(),
  } as unknown as PromoteProcessDeps & {
    queryExtractedEvents: ReturnType<typeof vi.fn>;
    deleteSignalArtifacts: ReturnType<typeof vi.fn>;
    insertAnalyticalRows: ReturnType<typeof vi.fn>;
    writeLatestProjection: ReturnType<typeof vi.fn>;
    updatePromotionStatus: ReturnType<typeof vi.fn>;
  };
}
