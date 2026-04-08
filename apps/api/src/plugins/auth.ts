import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendErrorResponse } from '../lib/api-error';
import { SecurityAuditEvent } from '../lib/audit-events';
import { extractBearerToken } from '../lib/bearer-token';
import { getFirebaseAuth } from '../lib/firebase-admin';
import { mapDecodedIdTokenToPrincipal } from '../lib/map-decoded-token';
import { logSecurityEvent } from '../lib/security-log';

/**
 * Requires `Authorization: Bearer <Firebase ID token>`. Sets `request.authUser` on success.
 */
/**
 * If `Authorization: Bearer` is present, verifies Firebase ID token and sets `request.authUser`.
 * If absent, continues without auth (for optional public read routes). Invalid token → 401.
 */
export async function optionalVerifyAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = extractBearerToken(request.headers.authorization);
  if (!token) {
    return;
  }

  try {
    const decoded = await getFirebaseAuth().verifyIdToken(token);
    request.authUser = mapDecodedIdTokenToPrincipal(decoded);
    logSecurityEvent(request, SecurityAuditEvent.AuthAuthenticated, {
      outcome: 'success',
      uid: request.authUser.uid,
    });
  } catch {
    logSecurityEvent(request, SecurityAuditEvent.AuthInvalidToken, {
      outcome: 'failure',
      reasonCode: 'VERIFY_FAILED',
    });
    await sendErrorResponse(reply, request, 401, 'UNAUTHENTICATED', 'Invalid or expired token');
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = extractBearerToken(request.headers.authorization);
  if (!token) {
    logSecurityEvent(request, SecurityAuditEvent.AuthMissingToken, {
      outcome: 'failure',
      reasonCode: 'MISSING_AUTHORIZATION',
    });
    await sendErrorResponse(
      reply,
      request,
      401,
      'UNAUTHENTICATED',
      'Missing or invalid Authorization header',
    );
    return;
  }

  try {
    const decoded = await getFirebaseAuth().verifyIdToken(token);
    request.authUser = mapDecodedIdTokenToPrincipal(decoded);
    logSecurityEvent(request, SecurityAuditEvent.AuthAuthenticated, {
      outcome: 'success',
      uid: request.authUser.uid,
    });
  } catch {
    logSecurityEvent(request, SecurityAuditEvent.AuthInvalidToken, {
      outcome: 'failure',
      reasonCode: 'VERIFY_FAILED',
    });
    await sendErrorResponse(reply, request, 401, 'UNAUTHENTICATED', 'Invalid or expired token');
    return;
  }
}
