import type { WorkspaceContext, WorkspaceRole } from '@signal/contracts';
import { WorkspaceMemberDocumentSchema, WorkspaceRootDocumentSchema } from '@signal/contracts';
import type admin from 'firebase-admin';
import { workspaceMemberRef, workspaceRootRef } from '../lib/firestore/refs';
import { normalizeFirestoreTimestamps } from '../lib/firestore/timestamps';
import { parseWorkspaceRole } from '../lib/workspace-role';

export type MembershipFailureCode =
  | 'WORKSPACE_NOT_FOUND'
  | 'WORKSPACE_INACTIVE'
  | 'MEMBER_NOT_FOUND'
  | 'MEMBER_INACTIVE'
  | 'INVALID_ROLE';

export type MembershipResolveResult =
  | { ok: true; workspace: WorkspaceContext; role: WorkspaceRole }
  | { ok: false; code: MembershipFailureCode };

/**
 * Workspace root only (no membership). Used for anonymous read-only serving when
 * `SIGNAL_PUBLIC_WORKSPACE_ID` / `publicWorkspaceId` targets an active workspace.
 */
export async function loadWorkspaceRootContext(
  db: admin.firestore.Firestore,
  workspaceId: string,
): Promise<WorkspaceContext | null> {
  const wsSnap = await workspaceRootRef(db, workspaceId).get();
  if (!wsSnap.exists) {
    return null;
  }

  const wsRaw = normalizeFirestoreTimestamps((wsSnap.data() ?? {}) as Record<string, unknown>);
  const wsParsed = WorkspaceRootDocumentSchema.safeParse(wsRaw);
  if (!wsParsed.success) {
    return null;
  }
  const ws = wsParsed.data;
  if (!ws.isActive) {
    return null;
  }

  const slug =
    ws.slug !== undefined && ws.slug !== null && ws.slug.trim() !== '' ? ws.slug.trim() : null;

  return { id: workspaceId, name: ws.name, slug };
}

/**
 * Loads workspace + member using canonical refs and Zod validation at the boundary.
 */
export async function resolveWorkspaceMembership(
  db: admin.firestore.Firestore,
  workspaceId: string,
  uid: string,
): Promise<MembershipResolveResult> {
  const wsSnap = await workspaceRootRef(db, workspaceId).get();
  if (!wsSnap.exists) {
    return { ok: false, code: 'WORKSPACE_NOT_FOUND' };
  }

  const wsRaw = normalizeFirestoreTimestamps((wsSnap.data() ?? {}) as Record<string, unknown>);
  const wsParsed = WorkspaceRootDocumentSchema.safeParse(wsRaw);
  if (!wsParsed.success) {
    return { ok: false, code: 'WORKSPACE_NOT_FOUND' };
  }
  const ws = wsParsed.data;
  if (!ws.isActive) {
    return { ok: false, code: 'WORKSPACE_INACTIVE' };
  }

  const slug =
    ws.slug !== undefined && ws.slug !== null && ws.slug.trim() !== '' ? ws.slug.trim() : null;

  const memberSnap = await workspaceMemberRef(db, workspaceId, uid).get();
  if (!memberSnap.exists) {
    return { ok: false, code: 'MEMBER_NOT_FOUND' };
  }

  const memberRaw = normalizeFirestoreTimestamps(
    (memberSnap.data() ?? {}) as Record<string, unknown>,
  );

  const memberParsed = WorkspaceMemberDocumentSchema.safeParse(memberRaw);
  if (memberParsed.success) {
    const member = memberParsed.data;
    if (member.uid !== uid) {
      return { ok: false, code: 'MEMBER_NOT_FOUND' };
    }
    if (!member.isActive) {
      return { ok: false, code: 'MEMBER_INACTIVE' };
    }
    return {
      ok: true,
      workspace: { id: workspaceId, name: ws.name, slug },
      role: member.role,
    };
  }

  const effectiveUid = typeof memberRaw.uid === 'string' ? memberRaw.uid : uid;
  if (effectiveUid !== uid) {
    return { ok: false, code: 'MEMBER_NOT_FOUND' };
  }
  if (memberRaw.isActive !== true) {
    return { ok: false, code: 'MEMBER_INACTIVE' };
  }

  const role = parseWorkspaceRole(memberRaw.role);
  if (!role) {
    return { ok: false, code: 'INVALID_ROLE' };
  }

  return {
    ok: true,
    workspace: { id: workspaceId, name: ws.name, slug },
    role,
  };
}
