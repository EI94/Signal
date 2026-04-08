import type { WorkspaceRole } from '@signal/contracts';

/** Explicit hierarchy: admin > analyst > viewer (higher index = more privilege). */
const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 0,
  analyst: 1,
  admin: 2,
};

/**
 * True if `actual` has at least the privileges of `minimum` (e.g. admin satisfies analyst).
 */
export function roleAtLeast(actual: WorkspaceRole, minimum: WorkspaceRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[minimum];
}

export function parseWorkspaceRole(raw: unknown): WorkspaceRole | null {
  if (raw === 'admin' || raw === 'analyst' || raw === 'viewer') {
    return raw;
  }
  return null;
}
