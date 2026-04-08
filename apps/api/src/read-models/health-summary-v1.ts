import type { BigQuery } from '@google-cloud/bigquery';
import type { ApiRuntimeConfig } from '@signal/config';
import type { HealthSummaryV1 } from '@signal/contracts';
import type admin from 'firebase-admin';
import {
  queryLatestOkUsageEventTimes,
  type UsageHealthEventType,
} from '../lib/bigquery/query-usage-events-health';
import { parseBriefDocument, parseLatestSignalDocument } from '../lib/firestore/parse-documents';
import {
  workspaceBriefsCollection,
  workspaceSignalsLatestCollection,
} from '../lib/firestore/workspace-collections';
import { isStaleByAgeMs } from '../lib/health/compute-stale';

export type UsageSnapshotForHealth = {
  readonly attempted: boolean;
  readonly ok: boolean;
  readonly reason: string | null;
  readonly lastByType: Partial<Record<UsageHealthEventType, Date>>;
};

/**
 * Pure merge of Firestore + optional usage_events snapshots into the WS10.2 contract shape.
 */
export function buildHealthSummaryV1(params: {
  readonly config: ApiRuntimeConfig;
  readonly now: Date;
  readonly firestoreOk: boolean;
  readonly firestoreReason: string | null;
  readonly signalsLatestDetectedAt: Date | null;
  readonly briefLatestUpdatedAt: Date | null;
  readonly usage: UsageSnapshotForHealth;
}): HealthSummaryV1 {
  const { config, now } = params;
  const nowMs = now.getTime();

  const lastIngest = params.usage.lastByType['ingest.run.complete'] ?? null;
  const lastPromote = params.usage.lastByType['intel.promote.complete'] ?? null;
  const lastBriefGen = params.usage.lastByType['intel.brief.generate.complete'] ?? null;
  const lastAlerts = params.usage.lastByType['intel.alerts.evaluate.complete'] ?? null;

  const signalsStale = isStaleByAgeMs(
    nowMs,
    params.signalsLatestDetectedAt?.getTime() ?? null,
    config.healthStaleSignalsHours,
  );
  const ingestStale = isStaleByAgeMs(
    nowMs,
    lastIngest?.getTime() ?? null,
    config.healthStaleIngestHours,
  );
  const briefStale = isStaleByAgeMs(
    nowMs,
    params.briefLatestUpdatedAt?.getTime() ?? null,
    config.healthStaleBriefHours,
  );

  const warnings: string[] = [];
  if (!params.firestoreOk && params.firestoreReason) {
    warnings.push(`firestore: ${params.firestoreReason}`);
  }
  if (params.usage.attempted && !params.usage.ok && params.usage.reason) {
    warnings.push(`usage_events: ${params.usage.reason}`);
  }
  if (!config.bigQueryDatasetId) {
    warnings.push(
      'usage_events: SIGNAL_BIGQUERY_DATASET not set for api; pipeline lag fields from usage_events are unavailable.',
    );
  } else if (!params.usage.attempted && params.usage.reason === 'bigquery_client_unavailable') {
    warnings.push('usage_events: BigQuery client not available despite dataset config.');
  }

  return {
    service: 'api',
    environment: config.environment,
    generatedAt: now.toISOString(),
    process: { status: 'healthy' },
    readiness: {
      status: params.firestoreOk ? 'ready' : 'not_ready',
      firestoreOk: params.firestoreOk,
      reason: params.firestoreReason,
    },
    thresholdsHours: {
      signalsLatest: config.healthStaleSignalsHours,
      ingestRun: config.healthStaleIngestHours,
      briefDocument: config.healthStaleBriefHours,
    },
    freshness: {
      signalsLatestDetectedAt: params.signalsLatestDetectedAt?.toISOString() ?? null,
      briefLatestUpdatedAt: params.briefLatestUpdatedAt?.toISOString() ?? null,
      lastIngestRunAt: lastIngest?.toISOString() ?? null,
      lastPromoteCompleteAt: lastPromote?.toISOString() ?? null,
      lastBriefGenerateCompleteAt: lastBriefGen?.toISOString() ?? null,
      lastAlertsEvaluateCompleteAt: lastAlerts?.toISOString() ?? null,
    },
    stale: {
      signalsLatest: signalsStale,
      ingestRun: ingestStale,
      briefDocument: briefStale,
    },
    usageEventsQuery: {
      attempted: params.usage.attempted,
      ok: params.usage.ok,
      reason: params.usage.reason,
    },
    warnings,
  };
}

async function readFirestoreFreshness(params: {
  readonly db: admin.firestore.Firestore;
  readonly workspaceId: string;
}): Promise<{
  ok: boolean;
  reason: string | null;
  signalsLatestDetectedAt: Date | null;
  briefLatestUpdatedAt: Date | null;
}> {
  const { db, workspaceId } = params;
  try {
    await db.collection('workspaces').doc(workspaceId).get();

    let signalsLatestDetectedAt: Date | null = null;
    const sigCol = workspaceSignalsLatestCollection(db, workspaceId);
    const sigSnap = await sigCol.orderBy('detectedAt', 'desc').limit(1).get();
    const sigDoc = sigSnap.docs[0];
    if (sigDoc) {
      const parsed = parseLatestSignalDocument(sigDoc.data());
      if (parsed.success) {
        signalsLatestDetectedAt = parsed.data.detectedAt;
      }
    }

    let briefLatestUpdatedAt: Date | null = null;
    const briefCol = workspaceBriefsCollection(db, workspaceId);
    const briefSnap = await briefCol.orderBy('updatedAt', 'desc').limit(1).get();
    const briefDoc = briefSnap.docs[0];
    if (briefDoc) {
      const parsed = parseBriefDocument(briefDoc.data());
      if (parsed.success) {
        briefLatestUpdatedAt = parsed.data.updatedAt;
      }
    }

    return {
      ok: true,
      reason: null,
      signalsLatestDetectedAt,
      briefLatestUpdatedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: message,
      signalsLatestDetectedAt: null,
      briefLatestUpdatedAt: null,
    };
  }
}

export async function loadHealthSummaryV1(params: {
  readonly config: ApiRuntimeConfig;
  readonly bigquery: BigQuery | null;
  readonly db: admin.firestore.Firestore;
  readonly now?: Date;
}): Promise<HealthSummaryV1> {
  const now = params.now ?? new Date();
  const workspaceId = params.config.defaultWorkspaceId;

  const fs = await readFirestoreFreshness({ db: params.db, workspaceId });

  let usage: UsageSnapshotForHealth = {
    attempted: false,
    ok: false,
    reason: null,
    lastByType: {},
  };

  const datasetId = params.config.bigQueryDatasetId;
  const bq = params.bigquery;
  if (datasetId && bq) {
    usage = { ...usage, attempted: true };
    const res = await queryLatestOkUsageEventTimes(bq, {
      projectId: params.config.firebaseProjectId,
      datasetId,
      tableId: params.config.bigQueryUsageEventsTableId,
      workspaceId,
      lookbackHours: params.config.healthUsageLookbackHours,
    });
    if (res.ok) {
      usage = { attempted: true, ok: true, reason: null, lastByType: res.lastByType };
    } else {
      usage = { attempted: true, ok: false, reason: res.error, lastByType: {} };
    }
  } else if (datasetId && !bq) {
    usage = {
      attempted: false,
      ok: false,
      reason: 'bigquery_client_unavailable',
      lastByType: {},
    };
  }

  return buildHealthSummaryV1({
    config: params.config,
    now,
    firestoreOk: fs.ok,
    firestoreReason: fs.reason,
    signalsLatestDetectedAt: fs.signalsLatestDetectedAt,
    briefLatestUpdatedAt: fs.briefLatestUpdatedAt,
    usage,
  });
}
