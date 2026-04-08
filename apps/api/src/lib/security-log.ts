import type { FastifyRequest } from 'fastify';
import type { SecurityAuditEventName } from './audit-events';

export type SecurityLogOutcome = 'success' | 'failure';

/**
 * Privacy-aware structured security log line (JSON via Pino). Never pass tokens or full JWT claims.
 */
export function logSecurityEvent(
  request: FastifyRequest,
  eventType: SecurityAuditEventName,
  fields: {
    outcome: SecurityLogOutcome;
    uid?: string | null;
    workspaceId?: string | null;
    role?: string | null;
    reasonCode?: string;
  },
): void {
  const path =
    request.routeOptions?.url ??
    (request.url.includes('?') ? request.url.split('?')[0] : request.url);

  request.log.info(
    {
      kind: 'security',
      eventType,
      outcome: fields.outcome,
      requestId: request.id,
      method: request.method,
      path,
      ...(fields.uid !== undefined && fields.uid !== null ? { uid: fields.uid } : {}),
      ...(fields.workspaceId !== undefined && fields.workspaceId !== null
        ? { workspaceId: fields.workspaceId }
        : {}),
      ...(fields.role !== undefined && fields.role !== null ? { role: fields.role } : {}),
      ...(fields.reasonCode ? { reasonCode: fields.reasonCode } : {}),
    },
    'security',
  );
}
