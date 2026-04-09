import type { IngestRuntimeConfig } from '@signal/config';
import type {
  IngestRunOnceResponse,
  IngestRunOnceSummary,
  SourceRegistryDocument,
} from '@signal/contracts';
import type admin from 'firebase-admin';
import { archiveSourceContentAndPersistRow } from './archive-source-content';
import { calloutIntelPipeline } from './callout-intel-pipeline';
import { type PersistRequestPayload, processOneSource } from './process-one-source';
import { publishSourceContentPersistedHandoff } from './publish-source-content-handoff';
import { recordIngestRunCompleteMetering } from './record-usage-metering';
import { patchSourceOperationalFetchState } from './source-operational-patch';
import { getActiveSourceById, listActiveSources } from './source-registry-query';

async function handleQualifyingPersistence(
  db: admin.firestore.Firestore,
  config: IngestRuntimeConfig,
  persist: PersistRequestPayload,
  summary: IngestRunOnceSummary,
): Promise<void> {
  const now = new Date();

  if (!config.persistenceEnabled) {
    await patchSourceOperationalFetchState(db, persist.source.sourceId, {
      lastFetchedAt: persist.observedAt,
      updatedAt: now,
      fetchStatus: 'healthy',
      consecutiveFailures: 0,
      lastContentHash: persist.contentFingerprintHex,
    });
    summary.persistSkipped++;
    return;
  }

  try {
    const archived = await archiveSourceContentAndPersistRow({
      config,
      source: persist.source,
      rawBody: persist.rawBody,
      contentFingerprintHex: persist.contentFingerprintHex,
      observedAt: persist.observedAt,
      contentType: persist.contentType,
      publishedAt: persist.lastModified,
    });
    summary.archived++;
    summary.persisted++;
    const handoff = await publishSourceContentPersistedHandoff(config, archived, persist);
    if (handoff === 'published') summary.published++;
    else if (handoff === 'publish_failed') summary.publishFailed++;
    else summary.publishSkipped++;

    const callout = await calloutIntelPipeline(config, archived, persist);
    if (callout === 'called') summary.pipelineCalled++;
    else if (callout === 'call_failed') summary.pipelineCallFailed++;
    else summary.pipelineCallSkipped++;
    await patchSourceOperationalFetchState(db, persist.source.sourceId, {
      lastFetchedAt: persist.observedAt,
      updatedAt: now,
      fetchStatus: 'healthy',
      consecutiveFailures: 0,
      lastContentHash: persist.contentFingerprintHex,
      lastArchivedGcsUri: archived.archivedGcsUri,
    });
  } catch {
    summary.persistFailed++;
    const failures = (persist.source.consecutiveFailures ?? 0) + 1;
    await patchSourceOperationalFetchState(db, persist.source.sourceId, {
      lastFetchedAt: persist.observedAt,
      updatedAt: now,
      fetchStatus: 'failing',
      consecutiveFailures: failures,
    });
  }
}

export async function runOnceIngestCycle(
  db: admin.firestore.Firestore,
  config: IngestRuntimeConfig,
  options?: {
    sourceId?: string;
    orchestrationEcho?: {
      correlationId?: string;
      idempotencyKey?: string;
      scheduledAt?: string;
    };
  },
): Promise<IngestRunOnceResponse> {
  const runAt = new Date().toISOString();
  const singleSourceRun = Boolean(options?.sourceId);
  let sources: SourceRegistryDocument[];
  if (options?.sourceId) {
    const one = await getActiveSourceById(db, options.sourceId);
    sources = one ? [one] : [];
  } else {
    sources = await listActiveSources(db);
  }

  let maxSourcesPerRunApplied: number | null = null;
  let sourcesOmittedByCap = 0;
  if (!singleSourceRun && sources.length > config.ingestMaxSourcesPerRun) {
    sourcesOmittedByCap = sources.length - config.ingestMaxSourcesPerRun;
    maxSourcesPerRunApplied = config.ingestMaxSourcesPerRun;
    sources = sources.slice(0, config.ingestMaxSourcesPerRun);
  }

  const summary: IngestRunOnceSummary = {
    processed: 0,
    unchanged: 0,
    changed: 0,
    firstSeen: 0,
    failed: 0,
    skipped: 0,
    archived: 0,
    persisted: 0,
    persistSkipped: 0,
    persistFailed: 0,
    published: 0,
    publishFailed: 0,
    publishSkipped: 0,
    skippedRatePolicy: 0,
    maxSourcesPerRunApplied,
    sourcesOmittedByCap,
    pipelineCalled: 0,
    pipelineCallFailed: 0,
    pipelineCallSkipped: 0,
  };

  for (const source of sources) {
    summary.processed++;
    const outcome = await processOneSource(db, source, config);
    const rec = outcome.record;

    switch (rec.deltaOutcome) {
      case 'unchanged':
        summary.unchanged++;
        break;
      case 'changed':
        summary.changed++;
        break;
      case 'first_seen':
        summary.firstSeen++;
        break;
      case 'fetch_failed':
        summary.failed++;
        break;
      case 'unsupported_or_skipped':
        summary.skipped++;
        break;
    }

    if (rec.reasonCode === 'rate_policy_deferred') {
      summary.skippedRatePolicy++;
    }

    if (outcome.persistRequest) {
      await handleQualifyingPersistence(db, config, outcome.persistRequest, summary);
    }
  }

  await recordIngestRunCompleteMetering(config, { runAtIso: runAt, summary });

  const response: IngestRunOnceResponse = { ok: true, runAt, summary };
  const echo = options?.orchestrationEcho;
  if (
    echo &&
    (echo.correlationId !== undefined ||
      echo.idempotencyKey !== undefined ||
      echo.scheduledAt !== undefined)
  ) {
    response.orchestrationEcho = {
      ...(echo.correlationId !== undefined ? { correlationId: echo.correlationId } : {}),
      ...(echo.idempotencyKey !== undefined ? { idempotencyKey: echo.idempotencyKey } : {}),
      ...(echo.scheduledAt !== undefined ? { scheduledAt: echo.scheduledAt } : {}),
    };
  }
  return response;
}
