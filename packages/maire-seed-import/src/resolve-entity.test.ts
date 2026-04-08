import { describe, expect, it } from 'vitest';
import { buildKeyToEntityIds, resolveTokenFromMaps } from './resolve-entity';

describe('resolveTokenFromMaps', () => {
  const rows = [
    {
      entityType: 'organization',
      canonicalName: 'A',
      entityId: 'id-a',
      aliases: [] as string[],
    },
    {
      entityType: 'organization',
      canonicalName: 'B',
      entityId: 'id-b',
      aliases: ['shared'],
    },
    {
      entityType: 'organization',
      canonicalName: 'C',
      entityId: 'id-c',
      aliases: ['shared'],
    },
  ];

  it('detects duplicate keys across canonical and aliases', () => {
    const entityIdToRow = new Map(rows.map((r) => [r.entityId, r]));
    const keyToEntityIds = buildKeyToEntityIds(rows);
    const r = resolveTokenFromMaps('shared', rows, keyToEntityIds, entityIdToRow);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('ambiguous');
  });
});
