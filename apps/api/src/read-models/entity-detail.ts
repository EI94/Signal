import type { BigQuery } from '@google-cloud/bigquery';
import type { ApiRuntimeConfig } from '@signal/config';
import type {
  EntityDetailQueryV1,
  EntityDetailV1Response,
  LatestSignalDocument,
} from '@signal/contracts';
import { queryEntitySignalLinkTimeline } from '../lib/bigquery/entity-timeline';
import { getFirestoreDb } from '../lib/firebase-admin';
import { parseLatestSignalDocument } from '../lib/firestore/parse-documents';
import { workspaceSignalsLatestCollection } from '../lib/firestore/workspace-collections';
import { decodeTimelineCursor, encodeTimelineCursor } from './entity-timeline-cursor';
import {
  filterAndSortTimelineFromFirestore,
  seekAfterTimelineCursor,
} from './entity-timeline-query';
import { mapLatestToSignalSummaryV1 } from './signal-summary-mapper';
import { loadLatestSignalsWindow } from './signals-window';

function entityRefMatches(
  doc: LatestSignalDocument,
  entityType: string,
  entityId: string,
): boolean {
  return doc.entityRefs.some((e) => e.entityType === entityType && e.entityId === entityId);
}

function findDisplayName(
  docs: LatestSignalDocument[],
  entityType: string,
  entityId: string,
): string | undefined {
  for (const d of docs) {
    for (const e of d.entityRefs) {
      if (e.entityType === entityType && e.entityId === entityId && e.displayName) {
        return e.displayName;
      }
    }
  }
  return undefined;
}

export async function buildEntityDetailReadModel(params: {
  readonly config: ApiRuntimeConfig;
  readonly bigquery: BigQuery | null;
  readonly workspaceId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly query: EntityDetailQueryV1;
}): Promise<EntityDetailV1Response> {
  const { config, bigquery, workspaceId, entityType, entityId, query } = params;
  const db = getFirestoreDb();
  const window = await loadLatestSignalsWindow(db, workspaceId);

  const linked = window
    .filter((d) => entityRefMatches(d, entityType, entityId))
    .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
    .slice(0, 20);

  const recentSignals = linked
    .map((d) => mapLatestToSignalSummaryV1(d))
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const displayName = findDisplayName(window, entityType, entityId);

  const tl = query.timelineLimit ?? 32;

  let timelinePreview: EntityDetailV1Response['timelinePreview'];
  let timelineNextCursor: string | null | undefined;

  if (config.bigQueryDatasetId && bigquery) {
    const cursorDecoded = decodeTimelineCursor(query.timelineCursor);

    const bqRows = await queryEntitySignalLinkTimeline(bigquery, {
      projectId: config.firebaseProjectId,
      datasetId: config.bigQueryDatasetId,
      tableId: config.bigQueryEntitySignalLinksTableId,
      workspaceId,
      entityType,
      entityId,
      limit: tl + 1,
      signalTypeFilter: query.timelineSignalType,
      statusFilter: query.timelineStatus,
      minScore: query.timelineMinScore,
      detectedAfter: query.timelineDetectedAfter
        ? new Date(query.timelineDetectedAfter)
        : undefined,
      detectedBefore: query.timelineDetectedBefore
        ? new Date(query.timelineDetectedBefore)
        : undefined,
      cursorDetectedAt: cursorDecoded ? new Date(cursorDecoded.detectedAt) : undefined,
      cursorSignalId: cursorDecoded?.signalId,
    });

    const hasMore = bqRows.length > tl;
    const pageRows = hasMore ? bqRows.slice(0, tl) : bqRows;

    const col = workspaceSignalsLatestCollection(db, workspaceId);
    const refs = pageRows.map((r) => col.doc(r.signal_id));
    const snaps = refs.length > 0 ? await db.getAll(...refs) : [];

    const titleBySignalId = new Map<string, string>();
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const parsed = parseLatestSignalDocument(snap.data());
      if (parsed.success) {
        titleBySignalId.set(parsed.data.signalId, parsed.data.title);
      }
    }

    timelinePreview = pageRows.map((r) => {
      const title = titleBySignalId.get(r.signal_id);
      const occurred = r.occurred_at ?? r.detected_at;
      return {
        occurredAt: occurred.toISOString(),
        label: title && title.trim() !== '' ? title : r.signal_type,
        signalId: r.signal_id,
      };
    });

    const lastBq = pageRows[pageRows.length - 1];
    if (hasMore && lastBq) {
      timelineNextCursor = encodeTimelineCursor(lastBq.detected_at, lastBq.signal_id);
    } else {
      timelineNextCursor = null;
    }
  } else {
    const linkedAll = window.filter((d) => entityRefMatches(d, entityType, entityId));
    const sorted = filterAndSortTimelineFromFirestore(linkedAll, {
      timelineSignalType: query.timelineSignalType,
      timelineStatus: query.timelineStatus,
      timelineMinScore: query.timelineMinScore,
      timelineDetectedBefore: query.timelineDetectedBefore,
      timelineDetectedAfter: query.timelineDetectedAfter,
    });
    const start = seekAfterTimelineCursor(sorted, query.timelineCursor);
    const slice = sorted.slice(start, start + tl + 1);
    const hasMore = slice.length > tl;
    const pageDocs = hasMore ? slice.slice(0, tl) : slice;

    timelinePreview = pageDocs.map((d) => ({
      occurredAt: d.occurredAt.toISOString(),
      label: d.title,
      signalId: d.signalId,
    }));

    const lastFs = pageDocs[pageDocs.length - 1];
    if (hasMore && lastFs) {
      timelineNextCursor = encodeTimelineCursor(lastFs.detectedAt, lastFs.signalId);
    } else {
      timelineNextCursor = null;
    }
  }

  return {
    workspaceId,
    entity: {
      entityType,
      entityId,
      ...(displayName ? { displayName } : {}),
    },
    recentSignals,
    ...(timelinePreview && timelinePreview.length > 0
      ? { timelinePreview, timelineNextCursor: timelineNextCursor ?? null }
      : {}),
  };
}
