import type { ApiRuntimeConfig } from '@signal/config';
import type { WorkspaceRole } from '@signal/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendErrorResponse } from '../lib/api-error';
import { SecurityAuditEvent } from '../lib/audit-events';
import { getFirestoreDb } from '../lib/firebase-admin';
import { logSecurityEvent } from '../lib/security-log';
import { roleAtLeast } from '../lib/workspace-role';
import {
  resolveWorkspaceMembership as loadMembership,
  loadWorkspaceRootContext,
  type MembershipFailureCode,
} from '../repositories/workspace-repository';

const MEMBERSHIP_DENIED: Record<MembershipFailureCode, string> = {
  WORKSPACE_NOT_FOUND: 'Workspace does not exist or is misconfigured',
  WORKSPACE_INACTIVE: 'Workspace is not active',
  MEMBER_NOT_FOUND: 'User is not a member of this workspace',
  MEMBER_INACTIVE: 'Membership is not active for this workspace',
  INVALID_ROLE: 'Membership role is invalid',
};

/**
 * After `requireAuth`: resolves Firestore membership for the default workspace or
 * `X-Signal-Workspace-Id` override. Sets `workspaceContext` and `effectiveRole` on success; 403 on failure.
 */
/**
 * For routes that allow anonymous read: if `request.authUser` is set, resolve membership as usual;
 * otherwise attach the configured public workspace (root doc only, viewer role).
 */
export function createResolveWorkspacePublicOrMember(config: ApiRuntimeConfig) {
  const memberResolver = createResolveWorkspaceMembership(config);
  return async function resolveWorkspacePublicOrMember(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (request.authUser?.uid) {
      await memberResolver(request, reply);
      return;
    }

    const ctx = await loadWorkspaceRootContext(getFirestoreDb(), config.publicWorkspaceId);
    if (!ctx) {
      logSecurityEvent(request, SecurityAuditEvent.AuthzWorkspaceMembershipDenied, {
        outcome: 'failure',
        workspaceId: config.publicWorkspaceId,
        reasonCode: 'WORKSPACE_NOT_FOUND',
      });
      await sendErrorResponse(
        reply,
        request,
        503,
        'PUBLIC_WORKSPACE_UNAVAILABLE',
        'Public read workspace is not available',
      );
      return;
    }

    request.workspaceContext = ctx;
    request.effectiveRole = 'viewer';
  };
}

export function createResolveWorkspaceMembership(config: ApiRuntimeConfig) {
  return async function resolveWorkspaceMembership(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const uid = request.authUser?.uid;
    if (!uid) {
      request.log.error(
        {
          kind: 'security',
          requestId: request.id,
          message: 'authUser missing after requireAuth',
        },
        'security',
      );
      await sendErrorResponse(
        reply,
        request,
        500,
        'INTERNAL',
        'Authentication context was not initialized',
      );
      return;
    }

    const raw = request.headers['x-signal-workspace-id'];
    const fromHeader = typeof raw === 'string' ? raw.trim() : '';
    const workspaceId = fromHeader || config.defaultWorkspaceId;

    const result = await loadMembership(getFirestoreDb(), workspaceId, uid);
    if (!result.ok) {
      logSecurityEvent(request, SecurityAuditEvent.AuthzWorkspaceMembershipDenied, {
        outcome: 'failure',
        uid,
        workspaceId,
        reasonCode: result.code,
      });
      await sendErrorResponse(reply, request, 403, result.code, MEMBERSHIP_DENIED[result.code]);
      return;
    }

    request.workspaceContext = result.workspace;
    request.effectiveRole = result.role;
  };
}

/** After membership is resolved: requires `effectiveRole` ≥ `minRole` (admin > analyst > viewer). */
export function requireRole(minRole: WorkspaceRole) {
  return async function requireRoleGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const role = request.effectiveRole;
    const uid = request.authUser?.uid ?? null;
    const workspaceId = request.workspaceContext?.id ?? null;

    if (!role || !roleAtLeast(role, minRole)) {
      logSecurityEvent(request, SecurityAuditEvent.AuthzRoleDenied, {
        outcome: 'failure',
        uid,
        workspaceId,
        role: role ?? undefined,
        reasonCode: 'INSUFFICIENT_ROLE',
      });
      await sendErrorResponse(
        reply,
        request,
        403,
        'INSUFFICIENT_ROLE',
        `This action requires role "${minRole}" or higher`,
      );
      return;
    }
  };
}
