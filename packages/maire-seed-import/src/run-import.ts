import type { BusinessEntitySeedDocument } from '@signal/contracts/firestore-operational';
import type admin from 'firebase-admin';
import { readCsvRecords } from './csv-read';
import { buildEntityLookup, docToSeededRow, seededEntityFromCsvRow } from './entity-index';
import {
  putBusinessEntitySeed,
  putRegistrySource,
  putWatchlist,
  type WriteOutcome,
} from './firestore-seed';
import {
  buildWatchlistDocument,
  groupWatchlistRows,
  type WatchlistCsvRow,
} from './group-watchlists';
import { mapSourceRowToRegistry } from './map-source-row';

export type FilePaths = {
  readonly entities: string;
  readonly sources: string;
  readonly watchlists: string;
};

export type ImportCounters = {
  readonly read: number;
  readonly invalid: number;
  readonly created: number;
  readonly updated: number;
};

export type ImportReport = {
  readonly entities: ImportCounters;
  readonly sources: ImportCounters;
  readonly watchlists: ImportCounters;
  readonly issues: readonly { readonly scope: string; readonly detail: string }[];
};

function emptyCounters(): ImportCounters {
  return { read: 0, invalid: 0, created: 0, updated: 0 };
}

function bump(c: ImportCounters, o: WriteOutcome): ImportCounters {
  return o === 'created' ? { ...c, created: c.created + 1 } : { ...c, updated: c.updated + 1 };
}

export function totalInvalidCount(report: ImportReport): number {
  return report.entities.invalid + report.sources.invalid + report.watchlists.invalid;
}

export async function runMaireSeedImport(params: {
  readonly workspaceId: string;
  readonly files: FilePaths;
  readonly apply: boolean;
  readonly createdBy: string;
  readonly seedLabel: string;
  readonly now: Date;
  readonly db: admin.firestore.Firestore | null;
}): Promise<ImportReport> {
  const issues: { scope: string; detail: string }[] = [];
  let entityCounter = emptyCounters();
  let sourceCounter = emptyCounters();
  let watchlistCounter = emptyCounters();

  const entityRows = readCsvRecords(params.files.entities);
  const seededDocs: BusinessEntitySeedDocument[] = [];
  for (let i = 0; i < entityRows.length; i++) {
    entityCounter = { ...entityCounter, read: entityCounter.read + 1 };
    const r = seededEntityFromCsvRow(entityRows[i] ?? {}, params.seedLabel, params.now);
    if (!r.ok) {
      entityCounter = { ...entityCounter, invalid: entityCounter.invalid + 1 };
      issues.push({ scope: 'entities', detail: `row ${i + 2}: ${r.error}` });
      continue;
    }
    seededDocs.push(r.doc);
    if (params.apply && params.db) {
      const out = await putBusinessEntitySeed(params.db, params.workspaceId, r.doc);
      entityCounter = bump(entityCounter, out);
    }
  }

  const seededRows = seededDocs.map(docToSeededRow);
  const lookup = buildEntityLookup(seededRows);

  const sourceRows = readCsvRecords(params.files.sources);
  for (let i = 0; i < sourceRows.length; i++) {
    sourceCounter = { ...sourceCounter, read: sourceCounter.read + 1 };
    const mapped = mapSourceRowToRegistry(sourceRows[i] ?? {}, {
      createdBy: params.createdBy,
      now: params.now,
      resolveEntityToken: (t) => lookup.resolveToken(t),
    });
    if (!mapped.ok) {
      sourceCounter = { ...sourceCounter, invalid: sourceCounter.invalid + 1 };
      issues.push({ scope: 'sources', detail: `row ${i + 2}: ${mapped.error}` });
      continue;
    }
    if (params.apply && params.db) {
      const out = await putRegistrySource(params.db, mapped.doc);
      sourceCounter = bump(sourceCounter, out);
    }
  }

  const wlRaw = readCsvRecords(params.files.watchlists) as unknown as Record<string, string>[];
  const wlRows: WatchlistCsvRow[] = wlRaw.map((row, i) => ({
    watchlistName: row.watchlistName ?? '',
    entityType: row.entityType ?? '',
    entityIdOrCanonicalName: row.entityIdOrCanonicalName ?? '',
    priority: row.priority ?? '',
    sourceRowNumber: i + 2,
  }));

  watchlistCounter = { ...watchlistCounter, read: wlRows.length };

  for (let i = 0; i < wlRows.length; i++) {
    const r = wlRows[i];
    if (r === undefined) continue;
    if (!r.watchlistName.trim() || !r.entityType.trim() || !r.entityIdOrCanonicalName.trim()) {
      watchlistCounter = { ...watchlistCounter, invalid: watchlistCounter.invalid + 1 };
      issues.push({
        scope: 'watchlists',
        detail: `row ${i + 2}: empty watchlistName, entityType, or entityIdOrCanonicalName`,
      });
    }
  }

  const wlValid = wlRows.filter(
    (r) =>
      r.watchlistName.trim() !== '' &&
      r.entityType.trim() !== '' &&
      r.entityIdOrCanonicalName.trim() !== '',
  );
  const grouped = groupWatchlistRows(wlValid);
  for (const [name, rows] of grouped) {
    const built = buildWatchlistDocument({
      workspaceId: params.workspaceId,
      watchlistName: name,
      rows,
      resolve: (entityType, token) => lookup.resolveScoped(entityType, token),
      createdBy: params.createdBy,
      now: params.now,
    });
    if (!built.ok) {
      if ('rowFailures' in built) {
        watchlistCounter = {
          ...watchlistCounter,
          invalid: watchlistCounter.invalid + built.rowFailures.length,
        };
        for (const f of built.rowFailures) {
          issues.push({
            scope: 'watchlists',
            detail: `${name}: ${f.detail}`,
          });
        }
        continue;
      }
      watchlistCounter = { ...watchlistCounter, invalid: watchlistCounter.invalid + 1 };
      issues.push({ scope: 'watchlists', detail: `${name}: ${built.schemaError}` });
      continue;
    }
    if (params.apply && params.db) {
      const out = await putWatchlist(params.db, params.workspaceId, built.watchlistId, built.doc);
      watchlistCounter = bump(watchlistCounter, out);
    }
  }

  return {
    entities: entityCounter,
    sources: sourceCounter,
    watchlists: watchlistCounter,
    issues,
  };
}
