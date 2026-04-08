/**
 * Minimal security / access audit vocabulary (structured logs only; no persistence in WS2.3).
 */
export const SecurityAuditEvent = {
  AuthMissingToken: 'auth.missing_token',
  AuthInvalidToken: 'auth.invalid_token',
  AuthAuthenticated: 'auth.authenticated',
  AuthzWorkspaceMembershipDenied: 'authz.workspace_membership_denied',
  AuthzRoleDenied: 'authz.role_denied',
  AuthzAccessGranted: 'authz.access_granted',
  /** WS11.3 — structured log for POST /v1/actions/execute (action name in `reasonCode`). */
  AgentDashboardActionExecuted: 'agent_actions.executed',
} as const;

export type SecurityAuditEventName = (typeof SecurityAuditEvent)[keyof typeof SecurityAuditEvent];
