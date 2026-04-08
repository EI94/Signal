import type { EntityRef } from '@signal/contracts/firestore-operational';

/** Minimal row shape for resolution (matches `SeededEntityRow` in entity-index). */
export type SeededEntityRowLike = {
  readonly entityType: string;
  readonly canonicalName: string;
  readonly entityId: string;
  readonly aliases: string[];
};

/** Result of resolving a CSV token to at most one seeded entity. */
export type ResolveEntityTokenResult =
  | { ok: true; ref: EntityRef }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'ambiguous'; detail: string };

function rowToRef(row: SeededEntityRowLike): EntityRef {
  return {
    entityType: row.entityType,
    entityId: row.entityId,
    displayName: row.canonicalName,
  };
}

function distinctIds(rows: readonly SeededEntityRowLike[]): Set<string> {
  return new Set(rows.map((r) => r.entityId));
}

/**
 * Build maps for strict resolution: each normalized key maps to the set of entityIds
 * that claim it (canonical name or alias). Multiple distinct ids ⇒ ambiguous lookup.
 */
export function buildKeyToEntityIds(
  rows: readonly SeededEntityRowLike[],
): Map<string, Set<string>> {
  const keyToEntityIds = new Map<string, Set<string>>();

  function addKey(key: string, entityId: string): void {
    const k = key.trim().toLowerCase();
    if (k.length === 0) return;
    let set = keyToEntityIds.get(k);
    if (!set) {
      set = new Set<string>();
      keyToEntityIds.set(k, set);
    }
    set.add(entityId);
  }

  for (const row of rows) {
    addKey(row.canonicalName, row.entityId);
    for (const a of row.aliases) {
      addKey(a, row.entityId);
    }
  }

  return keyToEntityIds;
}

export function resolveTokenFromMaps(
  token: string,
  _rows: readonly SeededEntityRowLike[],
  keyToEntityIds: Map<string, Set<string>>,
  entityIdToRow: Map<string, SeededEntityRowLike>,
): ResolveEntityTokenResult {
  const t = token.trim();
  if (t === '') return { ok: false, kind: 'not_found' };
  const k = t.toLowerCase();
  const ids = keyToEntityIds.get(k);
  if (!ids || ids.size === 0) {
    return { ok: false, kind: 'not_found' };
  }
  if (ids.size > 1) {
    const labels = [...ids]
      .map((id) => entityIdToRow.get(id))
      .filter((r): r is SeededEntityRowLike => r !== undefined)
      .map((r) => `${r.entityType}:${r.canonicalName}`)
      .sort();
    return {
      ok: false,
      kind: 'ambiguous',
      detail: `token "${token}" matches multiple entities: ${labels.join('; ')}`,
    };
  }
  const onlyId = [...ids][0];
  const row = onlyId !== undefined ? entityIdToRow.get(onlyId) : undefined;
  if (!row) return { ok: false, kind: 'not_found' };
  return { ok: true, ref: rowToRef(row) };
}

/**
 * Scoped resolution: same entityType and token matches canonical name or alias.
 * If no scoped match, fall back to global key map only when exactly one matching entity has that entityType.
 */
export function resolveScopedFromMaps(
  entityType: string,
  token: string,
  rows: readonly SeededEntityRowLike[],
  keyToEntityIds: Map<string, Set<string>>,
  entityIdToRow: Map<string, SeededEntityRowLike>,
): ResolveEntityTokenResult {
  const t = token.trim();
  if (t === '') return { ok: false, kind: 'not_found' };
  const lower = t.toLowerCase();

  const scopedMatches = rows.filter(
    (r) =>
      r.entityType === entityType &&
      (r.canonicalName.trim().toLowerCase() === lower ||
        r.aliases.some((a) => a.trim().toLowerCase() === lower)),
  );
  const scopedIds = distinctIds(scopedMatches);
  if (scopedIds.size > 1) {
    const labels = scopedMatches
      .filter((r, i, a) => a.findIndex((x) => x.entityId === r.entityId) === i)
      .map((r) => `${r.canonicalName} (${r.entityId})`);
    return {
      ok: false,
      kind: 'ambiguous',
      detail: `(${entityType}, "${token}") matches multiple entities: ${labels.join('; ')}`,
    };
  }
  if (scopedIds.size === 1) {
    const row = scopedMatches[0];
    if (row) return { ok: true, ref: rowToRef(row) };
  }

  const ids = keyToEntityIds.get(lower);
  if (!ids || ids.size === 0) {
    return { ok: false, kind: 'not_found' };
  }
  const typedRows = [...ids]
    .map((id) => entityIdToRow.get(id))
    .filter((r): r is SeededEntityRowLike => r !== undefined && r.entityType === entityType);
  const typedIds = distinctIds(typedRows);
  if (typedIds.size > 1) {
    const labels = typedRows
      .filter((r, i, a) => a.findIndex((x) => x.entityId === r.entityId) === i)
      .map((r) => `${r.canonicalName} (${r.entityId})`);
    return {
      ok: false,
      kind: 'ambiguous',
      detail: `(${entityType}, "${token}") matches multiple entities via shared key: ${labels.join('; ')}`,
    };
  }
  if (typedIds.size === 1) {
    const row = typedRows[0];
    if (row) return { ok: true, ref: rowToRef(row) };
  }
  return { ok: false, kind: 'not_found' };
}
