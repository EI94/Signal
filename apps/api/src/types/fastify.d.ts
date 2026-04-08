import type { WorkspaceContext, WorkspaceRole } from '@signal/contracts';
import type { AuthPrincipal } from './auth-principal';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthPrincipal;
    workspaceContext?: WorkspaceContext;
    effectiveRole?: WorkspaceRole;
  }
}
