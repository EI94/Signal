import type { ApiRuntimeConfig } from '@signal/config';
import type { AuthMeResponse } from '@signal/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { SecurityAuditEvent } from '../lib/audit-events';
import { logSecurityEvent } from '../lib/security-log';
import { requireAuth } from '../plugins/auth';
import { createResolveWorkspaceMembership, requireRole } from '../plugins/workspace';

export const authV1Routes: FastifyPluginAsync<{ config: ApiRuntimeConfig }> = async (app, opts) => {
  const resolveWorkspace = createResolveWorkspaceMembership(opts.config);

  app.get(
    '/me',
    { preHandler: [requireAuth, resolveWorkspace] },
    async (request): Promise<AuthMeResponse> => {
      const u = request.authUser;
      const workspace = request.workspaceContext;
      const role = request.effectiveRole;
      if (!u || !workspace || !role) {
        throw new Error('Expected auth + workspace context after guards');
      }

      logSecurityEvent(request, SecurityAuditEvent.AuthzAccessGranted, {
        outcome: 'success',
        uid: u.uid,
        workspaceId: workspace.id,
        role,
      });

      return {
        user: {
          uid: u.uid,
          email: u.email,
          emailVerified: u.emailVerified,
          displayName: u.displayName,
          photoUrl: u.photoUrl,
          signInProvider: u.signInProvider,
          customClaims: u.customClaims,
        },
        workspace,
        role,
      };
    },
  );

  app.get(
    '/admin-probe',
    { preHandler: [requireAuth, resolveWorkspace, requireRole('admin')] },
    async (request) => {
      const u = request.authUser;
      const w = request.workspaceContext;
      const role = request.effectiveRole;
      if (u && w && role) {
        logSecurityEvent(request, SecurityAuditEvent.AuthzAccessGranted, {
          outcome: 'success',
          uid: u.uid,
          workspaceId: w.id,
          role,
        });
      }
      return { ok: true as const, probe: 'admin' as const };
    },
  );

  app.get(
    '/analyst-probe',
    { preHandler: [requireAuth, resolveWorkspace, requireRole('analyst')] },
    async (request) => {
      const u = request.authUser;
      const w = request.workspaceContext;
      const role = request.effectiveRole;
      if (u && w && role) {
        logSecurityEvent(request, SecurityAuditEvent.AuthzAccessGranted, {
          outcome: 'success',
          uid: u.uid,
          workspaceId: w.id,
          role,
        });
      }
      return { ok: true as const, probe: 'analyst' as const };
    },
  );
};
