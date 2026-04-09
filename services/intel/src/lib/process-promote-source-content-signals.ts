import type { IntelRuntimeConfig } from '@signal/config';
import type { PromoteSourceContentSignalsRequest } from '@signal/contracts';
import { SIGNAL_PROMOTION_SCORING_VERSION } from '@signal/contracts';
import { deleteSignalArtifactsForSignalIds } from './delete-signal-artifacts-for-signal-ids';
import { downloadObjectBytes } from './download-object';
import { evaluateUserAlertsForSignal } from './evaluate-user-alerts';
import { getFirestoreDb, initFirebaseAdmin } from './firebase-admin';
import { parseGcsUri } from './gcs-uri';
import { enrichSignalWithGemini } from './gemini-enrichment';
import { lookupSourceLabel } from './lookup-source-label';
import { insertSignalAnalyticalRows } from './persist-promoted-signals';
import { buildLatestSignalDocument, writeSignalsLatestDocuments } from './project-signal-latest';
import {
  buildPromotionBundlesFromExtractedEvents,
  type PromotedSignalBundle,
} from './promote-extracted-events-to-signals';
import { queryExtractedEventsForSourceContent } from './query-extracted-events-for-source-content';
import { querySourceContentMetadata } from './query-source-content-metadata';
import { updateSourceContentPromotionStatus } from './update-source-content-promotion-status';

export type PromoteProcessDeps = {
  queryExtractedEvents: typeof queryExtractedEventsForSourceContent;
  deleteSignalArtifacts: typeof deleteSignalArtifactsForSignalIds;
  insertAnalyticalRows: typeof insertSignalAnalyticalRows;
  writeLatestProjection: (args: {
    workspaceId: string;
    sourceContentId: string;
    bundles: PromotedSignalBundle[];
    sourceUrl?: string;
    sourceLabel?: string;
    publishedAt?: Date | null;
  }) => Promise<void>;
  updatePromotionStatus: typeof updateSourceContentPromotionStatus;
  resolveSourceMetadata: (sourceContentId: string) => Promise<{ sourceUrl: string; sourceId: string; publishedAt: Date | null; normalizedGcsUri: string | null } | null>;
  lookupSourceLabel: (sourceId: string) => Promise<string | null>;
};

export type PromoteSourceContentSignalsResult =
  | { ok: true; skipped: true; reason: 'promotion_disabled' }
  | { ok: true; skipped: true; reason: 'no_extracted_events' }
  | {
      ok: true;
      skipped: false;
      sourceContentId: string;
      promotedSignalCount: number;
      extractionStatus: 'promoted_ready';
    };

const DEFAULT_SOURCE_AUTHORITY = 60;

export async function processPromoteSourceContentSignals(
  body: PromoteSourceContentSignalsRequest,
  config: IntelRuntimeConfig,
  deps: PromoteProcessDeps,
): Promise<PromoteSourceContentSignalsResult> {
  if (!config.signalPromotionEnabled) {
    return { ok: true, skipped: true, reason: 'promotion_disabled' };
  }

  const workspaceId = body.workspaceId ?? config.defaultWorkspaceId;
  if (!workspaceId) {
    throw new Error(
      'workspace_id_required: set SIGNAL_DEFAULT_WORKSPACE_ID or pass workspaceId in the request body',
    );
  }

  const observedAt = new Date(body.observedAt);
  const sourceAuthority = body.sourceAuthority ?? DEFAULT_SOURCE_AUTHORITY;

  try {
    const extracted = await deps.queryExtractedEvents({
      projectId: config.firebaseProjectId,
      datasetId: config.bigQueryDatasetId,
      tableId: config.bigQueryExtractedEventsTableId,
      sourceContentId: body.sourceContentId,
    });

    if (extracted.length === 0) {
      return { ok: true, skipped: true, reason: 'no_extracted_events' };
    }

    const bundles = buildPromotionBundlesFromExtractedEvents({
      events: extracted,
      workspaceId,
      observedAt,
      sourceAuthority,
      sourceContentId: body.sourceContentId,
    });

    const signalIds = bundles.map((b) => b.signalRow.signal_id);

    await deps.deleteSignalArtifacts({
      projectId: config.firebaseProjectId,
      datasetId: config.bigQueryDatasetId,
      signalsTableId: config.bigQuerySignalsTableId,
      signalScoreHistoryTableId: config.bigQuerySignalScoreHistoryTableId,
      entitySignalLinksTableId: config.bigQueryEntitySignalLinksTableId,
      signalIds,
      scoringVersion: SIGNAL_PROMOTION_SCORING_VERSION,
    });

    await deps.insertAnalyticalRows({
      projectId: config.firebaseProjectId,
      datasetId: config.bigQueryDatasetId,
      signalsTableId: config.bigQuerySignalsTableId,
      signalScoreHistoryTableId: config.bigQuerySignalScoreHistoryTableId,
      entitySignalLinksTableId: config.bigQueryEntitySignalLinksTableId,
      signalRows: bundles.map((b) => b.signalRow),
      scoreSnapshots: bundles.map((b) => b.scoreSnapshot),
      entityLinks: bundles.flatMap((b) => b.entityLinks),
    });

    let resolvedSourceUrl = body.sourceUrl;
    let resolvedSourceLabel = body.sourceLabel;
    let resolvedPublishedAt = body.publishedAt ? new Date(body.publishedAt) : null;
    let normalizedGcsUri: string | null = null;

    try {
      const meta = await deps.resolveSourceMetadata(body.sourceContentId);
      if (meta) {
        if (!resolvedSourceUrl && meta.sourceUrl) resolvedSourceUrl = meta.sourceUrl;
        if (!resolvedPublishedAt && meta.publishedAt) resolvedPublishedAt = meta.publishedAt;
        normalizedGcsUri = meta.normalizedGcsUri;
        if (!resolvedSourceLabel && meta.sourceId) {
          const label = await deps.lookupSourceLabel(meta.sourceId);
          if (label) resolvedSourceLabel = label;
        }
      }
    } catch (err) {
      console.warn('[promote] source metadata resolution failed, continuing without', err);
    }

    if (config.geminiEnabled && config.geminiApiKey && config.geminiMaxCallsPerRun > 0) {
      let sourceText: string | null = null;
      if (normalizedGcsUri) {
        try {
          const loc = parseGcsUri(normalizedGcsUri);
          const buf = await downloadObjectBytes({
            projectId: config.firebaseProjectId,
            bucketName: loc.bucket,
            objectKey: loc.objectKey,
          });
          sourceText = buf.toString('utf8');
        } catch (err) {
          console.warn('[promote] failed to load source text for Gemini enrichment:', err);
        }
      }

      if (sourceText) {
        let geminiCallCount = 0;
        for (const bundle of bundles) {
          if (geminiCallCount >= config.geminiMaxCallsPerRun) break;
          try {
            const enrichment = await enrichSignalWithGemini(config, {
              title: bundle.signalRow.title,
              rawText: sourceText,
              entityRefs: bundle.signalRow.entity_refs_json ?? [],
              signalType: bundle.signalRow.signal_type,
            });
            geminiCallCount++;
            if (enrichment) {
              if (enrichment.summary) {
                bundle.signalRow.short_summary = enrichment.summary;
              }
            }
          } catch (err) {
            console.warn('[promote] Gemini enrichment failed for signal %s:', bundle.signalRow.signal_id, err);
          }
        }
        console.info('[promote] Gemini enriched %d/%d bundles', geminiCallCount, bundles.length);
      }
    }

    await deps.writeLatestProjection({
      workspaceId,
      sourceContentId: body.sourceContentId,
      bundles,
      sourceUrl: resolvedSourceUrl,
      sourceLabel: resolvedSourceLabel,
      publishedAt: resolvedPublishedAt,
    });

    await deps.updatePromotionStatus({
      projectId: config.firebaseProjectId,
      datasetId: config.bigQueryDatasetId,
      tableId: config.bigQuerySourceContentsTableId,
      sourceContentId: body.sourceContentId,
      extractionStatus: 'promoted_ready',
      extractionErrorCode: null,
    });

    {
      initFirebaseAdmin(config.firebaseProjectId);
      const firestore = getFirestoreDb();
      for (const bundle of bundles) {
        void evaluateUserAlertsForSignal(
          { workspaceId, signalId: bundle.signalRow.signal_id },
          config,
          firestore,
        ).catch((err) =>
          console.error(
            '[promote] user-alert evaluation failed signal=%s',
            bundle.signalRow.signal_id,
            err,
          ),
        );
      }
    }

    return {
      ok: true,
      skipped: false,
      sourceContentId: body.sourceContentId,
      promotedSignalCount: bundles.length,
      extractionStatus: 'promoted_ready',
    };
  } catch (err) {
    const code = err instanceof Error ? err.message.slice(0, 240) : 'unknown_error';
    try {
      await deps.updatePromotionStatus({
        projectId: config.firebaseProjectId,
        datasetId: config.bigQueryDatasetId,
        tableId: config.bigQuerySourceContentsTableId,
        sourceContentId: body.sourceContentId,
        extractionStatus: 'promotion_failed',
        extractionErrorCode: code,
      });
    } catch {
      /* best-effort */
    }
    throw err;
  }
}

export function createDefaultPromoteDeps(config: IntelRuntimeConfig): PromoteProcessDeps {
  let db: ReturnType<typeof getFirestoreDb> | null = null;
  const getDb = () => {
    if (!db) {
      initFirebaseAdmin(config.firebaseProjectId);
      db = getFirestoreDb();
    }
    return db;
  };

  return {
    queryExtractedEvents: queryExtractedEventsForSourceContent,
    deleteSignalArtifacts: deleteSignalArtifactsForSignalIds,
    insertAnalyticalRows: insertSignalAnalyticalRows,
    writeLatestProjection: async ({
      workspaceId,
      sourceContentId,
      bundles,
      sourceUrl,
      sourceLabel,
      publishedAt,
    }) => {
      if (bundles.length === 0) return;
      const documents = bundles.map((b) =>
        buildLatestSignalDocument({
          row: b.signalRow,
          compositeScore: b.compositeScore,
          sourceContentId,
          sourceUrl,
          sourceLabel,
          publishedAt,
        }),
      );
      await writeSignalsLatestDocuments({ db: getDb(), workspaceId, documents });
    },
    updatePromotionStatus: updateSourceContentPromotionStatus,
    resolveSourceMetadata: (sourceContentId) =>
      querySourceContentMetadata({
        projectId: config.firebaseProjectId,
        datasetId: config.bigQueryDatasetId,
        tableId: config.bigQuerySourceContentsTableId,
        sourceContentId,
      }),
    lookupSourceLabel: (sourceId) => lookupSourceLabel(getDb(), sourceId),
  };
}
