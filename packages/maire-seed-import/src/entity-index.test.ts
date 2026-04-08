import { describe, expect, it } from 'vitest';
import { buildEntityLookup } from './entity-index';

describe('buildEntityLookup', () => {
  const rows = [
    {
      entityType: 'organization',
      canonicalName: 'ADNOC',
      entityId: 'id-adnoc',
      aliases: ['Abu Dhabi National Oil Company'],
    },
    {
      entityType: 'geography',
      canonicalName: 'Middle East',
      entityId: 'id-me',
      aliases: ['MENA'],
    },
  ];

  it('resolveToken matches canonical and alias', () => {
    const { resolveToken } = buildEntityLookup(rows);
    expect(resolveToken('ADNOC')).toEqual({
      ok: true,
      ref: {
        entityType: 'organization',
        entityId: 'id-adnoc',
        displayName: 'ADNOC',
      },
    });
    expect(resolveToken('middle east')).toMatchObject({
      ok: true,
      ref: { entityId: 'id-me' },
    });
    expect(resolveToken('MENA')).toMatchObject({
      ok: true,
      ref: { entityId: 'id-me' },
    });
  });

  it('resolveScoped requires entityType', () => {
    const { resolveScoped } = buildEntityLookup(rows);
    expect(resolveScoped('organization', 'ADNOC')).toMatchObject({
      ok: true,
      ref: { entityId: 'id-adnoc' },
    });
    expect(resolveScoped('geography', 'ADNOC').ok).toBe(false);
    expect(resolveScoped('organization', 'Middle East').ok).toBe(false);
  });

  it('flags ambiguous shared alias', () => {
    const dup = [
      ...rows,
      {
        entityType: 'organization',
        canonicalName: 'Other Co',
        entityId: 'id-other',
        aliases: ['MENA'],
      },
    ];
    const { resolveToken } = buildEntityLookup(dup);
    const r = resolveToken('MENA');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe('ambiguous');
    }
  });
});
