import {
  type BusinessEntitySeedDocument,
  BusinessEntitySeedDocumentSchema,
} from '@signal/contracts/firestore-operational';
import { lookupGeographyMeta } from '@signal/contracts/geography-iso';
import { entitySeedId } from './deterministic-ids';
import { parseAliasCell } from './parse-aliases';
import {
  buildKeyToEntityIds,
  type ResolveEntityTokenResult,
  resolveScopedFromMaps,
  resolveTokenFromMaps,
} from './resolve-entity';

export type { ResolveEntityTokenResult } from './resolve-entity';

export type EntityLookup = {
  resolveToken(token: string): ResolveEntityTokenResult;
  resolveScoped(entityType: string, token: string): ResolveEntityTokenResult;
  allRows: SeededEntityRow[];
};

export type SeededEntityRow = {
  readonly entityType: string;
  readonly canonicalName: string;
  readonly entityId: string;
  readonly aliases: string[];
};

/**
 * Build strict entity resolution maps from seeded rows. Ambiguous keys (same alias/canonical
 * string mapping to more than one entityId) surface as `ambiguous`, not silent first-wins.
 */
export function buildEntityLookup(rows: SeededEntityRow[]): EntityLookup {
  const entityIdToRow = new Map<string, SeededEntityRow>();
  for (const row of rows) {
    entityIdToRow.set(row.entityId, row);
  }
  const keyToEntityIds = buildKeyToEntityIds(rows);

  return {
    resolveToken(token: string): ResolveEntityTokenResult {
      return resolveTokenFromMaps(token, rows, keyToEntityIds, entityIdToRow);
    },
    resolveScoped(entityType: string, token: string): ResolveEntityTokenResult {
      return resolveScopedFromMaps(entityType, token, rows, keyToEntityIds, entityIdToRow);
    },
    allRows: rows,
  };
}

export function seededEntityFromCsvRow(
  row: Record<string, string>,
  seedLabel: string,
  now: Date,
): { ok: true; doc: BusinessEntitySeedDocument } | { ok: false; error: string } {
  const entityType = row.entityType?.trim();
  const canonicalName = row.canonicalName?.trim();
  if (!entityType || !canonicalName) {
    return { ok: false, error: 'missing entityType or canonicalName' };
  }
  const entityId = entitySeedId(entityType, canonicalName);
  const aliases = parseAliasCell(row.aliases);
  const geoMeta = entityType === 'geography' ? lookupGeographyMeta(canonicalName) : null;
  const doc = {
    entityType,
    entityId,
    canonicalName,
    aliases,
    category: row.category?.trim() || undefined,
    priority: row.priority?.trim() || undefined,
    notes: row.notes?.trim() || undefined,
    seedLabel,
    ...(geoMeta?.iso2 && { iso2: geoMeta.iso2 }),
    ...(geoMeta?.iso3 && { iso3: geoMeta.iso3 }),
    ...(geoMeta?.geographyKind && { geographyKind: geoMeta.geographyKind }),
    ...(geoMeta?.regionGroup && { regionGroup: geoMeta.regionGroup }),
    createdAt: now,
    updatedAt: now,
  };
  const parsed = BusinessEntitySeedDocumentSchema.safeParse(doc);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return { ok: true, doc: parsed.data };
}

export function docToSeededRow(doc: BusinessEntitySeedDocument): SeededEntityRow {
  return {
    entityType: doc.entityType,
    canonicalName: doc.canonicalName,
    entityId: doc.entityId,
    aliases: doc.aliases,
  };
}
