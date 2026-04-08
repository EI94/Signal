import { describe, expect, it } from 'vitest';
import {
  BusinessEntitySeedDocumentSchema,
  EntityRefSchema,
  WorkspaceMemberDocumentSchema,
  WorkspaceRootDocumentSchema,
} from '../firestore-operational';

describe('WorkspaceRootDocumentSchema', () => {
  it('accepts minimal operational workspace', () => {
    const r = WorkspaceRootDocumentSchema.safeParse({
      name: 'Acme',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(r.success).toBe(true);
  });

  it('rejects when name missing', () => {
    const r = WorkspaceRootDocumentSchema.safeParse({ isActive: true });
    expect(r.success).toBe(false);
  });
});

describe('WorkspaceMemberDocumentSchema', () => {
  it('accepts MVP member', () => {
    const r = WorkspaceMemberDocumentSchema.safeParse({
      uid: 'u1',
      role: 'admin',
      isActive: true,
    });
    expect(r.success).toBe(true);
  });
});

describe('EntityRefSchema', () => {
  it('requires type and id', () => {
    expect(EntityRefSchema.safeParse({ entityType: 'company', entityId: 'c1' }).success).toBe(true);
    expect(EntityRefSchema.safeParse({ entityId: 'x' }).success).toBe(false);
  });
});

describe('BusinessEntitySeedDocumentSchema', () => {
  it('accepts MAIRE-style seed doc', () => {
    const now = new Date();
    const r = BusinessEntitySeedDocumentSchema.safeParse({
      entityType: 'organization',
      entityId: '00000000-0000-4000-8000-000000000001',
      canonicalName: 'Example',
      aliases: ['Ex'],
      seedLabel: 'maire_csv_v1',
      createdAt: now,
      updatedAt: now,
    });
    expect(r.success).toBe(true);
  });
});
