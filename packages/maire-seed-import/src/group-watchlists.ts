import {
  type EntityRef,
  type WatchlistDocument,
  WatchlistDocumentSchema,
} from '@signal/contracts/firestore-operational';
import { watchlistId } from './deterministic-ids';
import type { ResolveEntityTokenResult } from './resolve-entity';

export type WatchlistCsvRow = {
  readonly watchlistName: string;
  readonly entityType: string;
  readonly entityIdOrCanonicalName: string;
  readonly priority: string;
  /** CSV data row index (1-based; first data row = 2 when header is row 1). */
  readonly sourceRowNumber?: number;
};

export type WatchlistRowFailure = {
  readonly sourceRowNumber?: number;
  readonly detail: string;
};

export function groupWatchlistRows(rows: WatchlistCsvRow[]): Map<string, WatchlistCsvRow[]> {
  const m = new Map<string, WatchlistCsvRow[]>();
  for (const r of rows) {
    const name = r.watchlistName.trim();
    if (name === '') continue;
    const list = m.get(name) ?? [];
    list.push(r);
    m.set(name, list);
  }
  return m;
}

export function buildWatchlistDocument(params: {
  readonly workspaceId: string;
  readonly watchlistName: string;
  readonly rows: WatchlistCsvRow[];
  readonly resolve: (entityType: string, token: string) => ResolveEntityTokenResult;
  readonly createdBy: string;
  readonly now: Date;
}):
  | { ok: true; doc: WatchlistDocument; watchlistId: string }
  | { ok: false; rowFailures: readonly WatchlistRowFailure[] }
  | { ok: false; schemaError: string } {
  const id = watchlistId(params.workspaceId, params.watchlistName);
  const rowFailures: WatchlistRowFailure[] = [];
  const refs: EntityRef[] = [];
  const seen = new Set<string>();

  for (const r of params.rows) {
    const res = params.resolve(r.entityType.trim(), r.entityIdOrCanonicalName.trim());
    const rowLabel =
      r.sourceRowNumber !== undefined ? `CSV row ${r.sourceRowNumber}` : 'watchlist row';
    if (!res.ok) {
      if (res.kind === 'not_found') {
        rowFailures.push({
          sourceRowNumber: r.sourceRowNumber,
          detail: `${rowLabel}: unresolved (${r.entityType}, "${r.entityIdOrCanonicalName}")`,
        });
      } else {
        rowFailures.push({
          sourceRowNumber: r.sourceRowNumber,
          detail: `${rowLabel}: ${res.detail}`,
        });
      }
      continue;
    }
    const key = `${res.ref.entityType}\0${res.ref.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(res.ref);
  }

  if (rowFailures.length > 0) {
    return { ok: false, rowFailures };
  }

  const description =
    'MAIRE seed import (Watchlists.csv). Row-level priority not stored in schema.';

  const candidate: WatchlistDocument = {
    name: params.watchlistName,
    description,
    entityRefs: refs,
    createdBy: params.createdBy,
    createdAt: params.now,
    updatedAt: params.now,
  };

  const parsed = WatchlistDocumentSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, schemaError: parsed.error.message };
  }
  return { ok: true, doc: parsed.data, watchlistId: id };
}
