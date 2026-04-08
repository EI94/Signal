import { describe, expect, it } from 'vitest';
import { AuthMeResponseSchema, WorkspaceRoleSchema } from '../index';

describe('WorkspaceRoleSchema', () => {
  it('accepts MVP roles', () => {
    expect(WorkspaceRoleSchema.safeParse('admin').success).toBe(true);
    expect(WorkspaceRoleSchema.safeParse('viewer').success).toBe(true);
  });

  it('rejects unknown roles', () => {
    expect(WorkspaceRoleSchema.safeParse('owner').success).toBe(false);
  });
});

describe('AuthMeResponseSchema', () => {
  it('validates workspace-aware /v1/auth/me shape', () => {
    const result = AuthMeResponseSchema.safeParse({
      user: {
        uid: 'u1',
        email: 'a@b.c',
        emailVerified: true,
        displayName: null,
        photoUrl: null,
        signInProvider: 'google.com',
        customClaims: {},
      },
      workspace: { id: 'ws1', name: 'Acme', slug: 'acme' },
      role: 'analyst',
    });
    expect(result.success).toBe(true);
  });
});
