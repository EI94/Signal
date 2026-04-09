import type { IntelRuntimeConfig } from '@signal/config';
import type { ExtractSourceContentRequest, SourceContentPersistedEvent } from '@signal/contracts';
import { getFirestoreDb, initFirebaseAdmin } from './firebase-admin';

export type OrchestratePipelineRequest = {
  sourceContentId: string;
  workspaceId?: string;
  observedAt?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  publishedAt?: string;
  sourceCategory?: string;
  linkedEntityRefs?: Array<{ entityType: string; entityId: string; displayName?: string }>;
  normalizedGcsUri?: string;
  archivedGcsUri?: string;
  manifestGcsUri?: string;
  sourceType?: string;
  mimeType?: string;
  sourceId?: string;
};

export type OrchestratePipelineResult = {
  ok: boolean;
  sourceContentId: string;
  steps: {
    normalize: { status: 'ok' | 'skipped' | 'error'; detail?: string };
    extract: { status: 'ok' | 'skipped' | 'error'; detail?: string; eventCount?: number };
    promote: { status: 'ok' | 'skipped' | 'error'; detail?: string; signalCount?: number };
  };
};

export async function orchestratePipeline(
  body: OrchestratePipelineRequest,
  config: IntelRuntimeConfig,
): Promise<OrchestratePipelineResult> {
  const result: OrchestratePipelineResult = {
    ok: false,
    sourceContentId: body.sourceContentId,
    steps: {
      normalize: { status: 'skipped' },
      extract: { status: 'skipped' },
      promote: { status: 'skipped' },
    },
  };

  const workspaceId = body.workspaceId ?? config.defaultWorkspaceId ?? undefined;
  const observedAt = body.observedAt ?? new Date().toISOString();

  initFirebaseAdmin(config.firebaseProjectId);
  const db = getFirestoreDb();

  // --- Step 1: look up source_contents row from BigQuery to get normalized_gcs_uri ---
  let normalizedGcsUri = body.normalizedGcsUri ?? null;
  let sourceUrl = body.sourceUrl;
  let sourceLabel = body.sourceLabel;
  let publishedAt = body.publishedAt;
  let sourceCategory = body.sourceCategory;
  let linkedEntityRefs = body.linkedEntityRefs;
  let sourceId: string | undefined;

  if (!normalizedGcsUri) {
    try {
      const { querySourceContentMetadata } = await import('./query-source-content-metadata');
      const meta = await querySourceContentMetadata({
        projectId: config.firebaseProjectId,
        datasetId: config.bigQueryDatasetId,
        tableId: config.bigQuerySourceContentsTableId,
        sourceContentId: body.sourceContentId,
      });
      if (meta) {
        normalizedGcsUri = meta.normalizedGcsUri;
        sourceId = meta.sourceId;
        if (!sourceUrl && meta.sourceUrl) sourceUrl = meta.sourceUrl;
        if (!publishedAt && meta.publishedAt) publishedAt = meta.publishedAt.toISOString();
        if (!sourceLabel && meta.sourceId) {
          const { lookupSourceLabel } = await import('./lookup-source-label');
          const label = await lookupSourceLabel(db, meta.sourceId);
          if (label) sourceLabel = label;

          const { SOURCE_REGISTRY_COLLECTION } = await import('@signal/contracts');
          const snap = await db.collection(SOURCE_REGISTRY_COLLECTION).doc(meta.sourceId).get();
          if (snap.exists) {
            const data = snap.data();
            if (!sourceCategory && data?.category) sourceCategory = String(data.category);
            if (!linkedEntityRefs && Array.isArray(data?.linkedEntityRefs)) {
              linkedEntityRefs = data.linkedEntityRefs;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[orchestrate] metadata lookup failed:', err);
    }
  }

  // --- Step 2: Normalize (source-content-persisted) ---
  if (!normalizedGcsUri) {
    if (!body.archivedGcsUri || !body.manifestGcsUri) {
      result.steps.normalize = {
        status: 'error',
        detail: 'missing archivedGcsUri/manifestGcsUri — cannot normalize without archive data',
      };
      console.error(
        '[orchestrate] normalize skipped for %s: no archivedGcsUri/manifestGcsUri provided and no normalizedGcsUri in BigQuery',
        body.sourceContentId,
      );
      result.ok = false;
      return result;
    }

    try {
      const { createDefaultProcessDeps, processSourceContentPersisted } = await import(
        './process-source-content-persisted'
      );
      const deps = createDefaultProcessDeps(config);
      const normalizeEvent: SourceContentPersistedEvent = {
        eventType: 'source_content.persisted',
        eventVersion: 'v1',
        sourceContentId: body.sourceContentId,
        sourceId: sourceId ?? body.sourceId ?? body.sourceContentId,
        registrySourceType: 'web_page',
        sourceType: body.sourceType ?? 'web_page',
        sourceUrl: sourceUrl ?? '',
        observedAt,
        archivedGcsUri: body.archivedGcsUri,
        manifestGcsUri: body.manifestGcsUri,
        contentHash: 'orchestrate-callout',
        mimeType: body.mimeType ?? null,
        language: null,
        workspaceId: workspaceId ?? null,
        publishedAt: publishedAt ?? null,
        emittedAt: new Date().toISOString(),
      };
      const normalizeResult = await processSourceContentPersisted(normalizeEvent, config, deps);
      if ('normalizedGcsUri' in normalizeResult && normalizeResult.normalizedGcsUri) {
        normalizedGcsUri = normalizeResult.normalizedGcsUri as string;
      }
      result.steps.normalize = { status: 'ok', detail: JSON.stringify(normalizeResult) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      result.steps.normalize = { status: 'error', detail: msg };
      console.error('[orchestrate] normalize failed:', err);
      result.ok = false;
      return result;
    }
  } else {
    result.steps.normalize = { status: 'skipped', detail: 'already_normalized' };
  }

  // --- Step 3: Extract events ---
  if (!normalizedGcsUri) {
    result.steps.extract = { status: 'skipped', detail: 'no_normalized_gcs_uri' };
    result.steps.promote = { status: 'skipped', detail: 'no_extraction' };
    result.ok = true;
    return result;
  }

  try {
    const { createDefaultExtractDeps, processExtractSourceContent } = await import(
      './process-extract-source-content'
    );
    const deps = createDefaultExtractDeps(config);
    const extractResult = await processExtractSourceContent(
      {
        sourceContentId: body.sourceContentId,
        sourceId: sourceId ?? body.sourceId ?? body.sourceContentId,
        normalizedGcsUri,
        observedAt,
        publishedAt: publishedAt ?? null,
        sourceCategory: sourceCategory as ExtractSourceContentRequest['sourceCategory'],
        linkedEntityRefs: linkedEntityRefs ?? [],
      },
      config,
      deps,
    );
    const eventCount =
      'extractedEventCount' in extractResult ? extractResult.extractedEventCount : 0;
    result.steps.extract = { status: 'ok', eventCount };
    if (eventCount === 0) {
      result.steps.promote = { status: 'skipped', detail: 'no_events_extracted' };
      result.ok = true;
      return result;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    result.steps.extract = { status: 'error', detail: msg };
    console.error('[orchestrate] extract failed:', err);
    result.ok = false;
    return result;
  }

  // --- Step 4: Promote ---
  try {
    const { createDefaultPromoteDeps, processPromoteSourceContentSignals } = await import(
      './process-promote-source-content-signals'
    );
    const deps = createDefaultPromoteDeps(config);
    const promoteResult = await processPromoteSourceContentSignals(
      {
        sourceContentId: body.sourceContentId,
        observedAt,
        workspaceId,
        sourceUrl,
        sourceLabel,
        publishedAt,
      },
      config,
      deps,
    );
    const signalCount =
      'promotedSignalCount' in promoteResult ? promoteResult.promotedSignalCount : 0;
    result.steps.promote = { status: 'ok', signalCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    result.steps.promote = { status: 'error', detail: msg };
    console.error('[orchestrate] promote failed:', err);
    result.ok = false;
    return result;
  }

  result.ok = true;
  return result;
}
