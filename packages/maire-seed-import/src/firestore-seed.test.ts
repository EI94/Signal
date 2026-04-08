import type { BusinessEntitySeedDocument } from '@signal/contracts/firestore-operational';
import { describe, expect, it, vi } from 'vitest';
import { putBusinessEntitySeed } from './firestore-seed';

function makeWorkspaceDb(entityDoc: {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}) {
  return {
    collection: (name: string) => {
      if (name === 'workspaces') {
        return {
          doc: () => ({
            collection: (sub: string) => {
              if (sub === 'businessEntitySeeds') {
                return { doc: () => entityDoc };
              }
              throw new Error(`unexpected ${sub}`);
            },
          }),
        };
      }
      throw new Error(`unexpected ${name}`);
    },
  };
}

describe('putBusinessEntitySeed createdAt', () => {
  const baseDoc: BusinessEntitySeedDocument = {
    entityType: 'organization',
    entityId: 'e1',
    canonicalName: 'Acme',
    aliases: [],
    seedLabel: 't',
    createdAt: new Date('2026-06-01T12:00:00.000Z'),
    updatedAt: new Date('2026-06-01T12:00:00.000Z'),
  };

  it('sets both timestamps on create', async () => {
    const get = vi.fn().mockResolvedValue({ exists: false });
    const set = vi.fn().mockResolvedValue(undefined);
    const db = makeWorkspaceDb({ get, set }) as unknown as Parameters<
      typeof putBusinessEntitySeed
    >[0];

    await putBusinessEntitySeed(db, 'ws1', baseDoc);

    expect(set).toHaveBeenCalledTimes(1);
    const written = set.mock.calls[0]?.[0] as BusinessEntitySeedDocument;
    expect(written?.createdAt).toEqual(baseDoc.createdAt);
    expect(written?.updatedAt).toEqual(baseDoc.updatedAt);
  });

  it('preserves createdAt on update', async () => {
    const firstCreated = new Date('2025-01-01T00:00:00.000Z');
    const get = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({ createdAt: firstCreated }),
    });
    const set = vi.fn().mockResolvedValue(undefined);
    const db = makeWorkspaceDb({ get, set }) as unknown as Parameters<
      typeof putBusinessEntitySeed
    >[0];

    const newer = { ...baseDoc, updatedAt: new Date('2026-07-01T00:00:00.000Z') };
    await putBusinessEntitySeed(db, 'ws1', newer);

    const written = set.mock.calls[0]?.[0] as BusinessEntitySeedDocument;
    expect(written?.createdAt).toEqual(firstCreated);
    expect(written?.updatedAt).toEqual(newer.updatedAt);
  });
});
