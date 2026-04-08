import type { BigQuery } from '@google-cloud/bigquery';

function toBqDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') return new Date(v);
  if (typeof v === 'object' && 'value' in v) return new Date((v as { value: string }).value);
  return null;
}

export type EntityTimelineRow = {
  readonly signal_id: string;
  readonly signal_type: string;
  readonly occurred_at: Date | null;
  readonly detected_at: Date;
};

export type EntityTimelineQueryParams = {
  readonly projectId: string;
  readonly datasetId: string;
  readonly tableId: string;
  readonly workspaceId: string;
  readonly entityType: string;
  readonly entityId: string;
  /** Max rows to return (caller may use limit+1 to detect hasMore). */
  readonly limit: number;
  readonly signalTypeFilter?: string;
  readonly statusFilter?: string;
  readonly minScore?: number;
  readonly detectedAfter?: Date;
  readonly detectedBefore?: Date;
  /** Keyset: rows strictly older than this anchor (detected_at DESC, signal_id DESC). */
  readonly cursorDetectedAt?: Date;
  readonly cursorSignalId?: string;
};

/**
 * Parameterized entity–signal timeline query. Explicit fragments only (WS6.3).
 */
export async function queryEntitySignalLinkTimeline(
  bigquery: BigQuery,
  params: EntityTimelineQueryParams,
): Promise<EntityTimelineRow[]> {
  const table = `\`${params.projectId}.${params.datasetId}.${params.tableId}\``;
  const where: string[] = [
    'entity_type = @entityType',
    'entity_id = @entityId',
    '(workspace_id = @workspaceId OR workspace_id IS NULL)',
  ];
  const qp: Record<string, unknown> = {
    entityType: params.entityType,
    entityId: params.entityId,
    workspaceId: params.workspaceId,
    limit: params.limit,
  };

  if (params.signalTypeFilter !== undefined) {
    where.push('signal_type = @signalTypeFilter');
    qp.signalTypeFilter = params.signalTypeFilter;
  }
  if (params.statusFilter !== undefined) {
    where.push('status = @statusFilter');
    qp.statusFilter = params.statusFilter;
  }
  if (params.minScore !== undefined) {
    where.push('IFNULL(composite_score, 0) >= @minScore');
    qp.minScore = params.minScore;
  }
  if (params.detectedAfter !== undefined) {
    where.push('detected_at > @detectedAfter');
    qp.detectedAfter = params.detectedAfter;
  }
  if (params.detectedBefore !== undefined) {
    where.push('detected_at < @detectedBefore');
    qp.detectedBefore = params.detectedBefore;
  }
  if (params.cursorDetectedAt !== undefined && params.cursorSignalId !== undefined) {
    where.push(
      '(detected_at < @cursorDetectedAt OR (detected_at = @cursorDetectedAt AND signal_id < @cursorSignalId))',
    );
    qp.cursorDetectedAt = params.cursorDetectedAt;
    qp.cursorSignalId = params.cursorSignalId;
  }

  const query = `
    SELECT signal_id, signal_type, occurred_at, detected_at
    FROM ${table}
    WHERE ${where.join(' AND ')}
    ORDER BY detected_at DESC, signal_id DESC
    LIMIT @limit
  `;

  const [rows] = await bigquery.query({ query, params: qp });

  const out: EntityTimelineRow[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const signal_id = typeof r.signal_id === 'string' ? r.signal_id : String(r.signal_id ?? '');
    const signal_type =
      typeof r.signal_type === 'string' ? r.signal_type : String(r.signal_type ?? '');
    const detected_at = toBqDate(r.detected_at) ?? new Date(0);
    const occurred_at = toBqDate(r.occurred_at);

    if (!signal_id) continue;
    out.push({ signal_id, signal_type, occurred_at, detected_at });
  }
  return out;
}
