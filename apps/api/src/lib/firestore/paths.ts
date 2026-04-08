/**
 * Canonical Firestore collection segment names (camelCase segments).
 * Workspace-scoped data lives under `workspaces/{workspaceId}/…`.
 */
export const FIRESTORE_COLLECTIONS = {
  /**
   * Global source registry (system scope). Document id = `sourceId`.
   * Not workspace-scoped: sources are pipeline configuration, not user preference.
   */
  sources: 'sources',
  workspaces: 'workspaces',
  members: 'members',
  watchlists: 'watchlists',
  savedViews: 'savedViews',
  signalsLatest: 'signalsLatest',
  notifications: 'notifications',
  featureFlags: 'featureFlags',
  briefs: 'briefs',
  alertRules: 'alertRules',
  memberPreferences: 'memberPreferences',
} as const;

/** Top-level collection path segment for logs (e.g. `sources`). */
export function sourcesCollectionPath(): string {
  return FIRESTORE_COLLECTIONS.sources;
}

/** `sources/{sourceId}` — document id must equal `sourceId` on the document. */
export function sourceDocumentPath(sourceId: string): string {
  return `${FIRESTORE_COLLECTIONS.sources}/${sourceId}`;
}

/** Human-readable path for logs (not a Firestore URL escape hatch). */
export function workspaceDocumentPath(workspaceId: string): string {
  return `${FIRESTORE_COLLECTIONS.workspaces}/${workspaceId}`;
}

export function workspaceMemberDocumentPath(workspaceId: string, uid: string): string {
  return `${workspaceDocumentPath(workspaceId)}/${FIRESTORE_COLLECTIONS.members}/${uid}`;
}

export function workspaceWatchlistDocumentPath(workspaceId: string, watchlistId: string): string {
  return `${workspaceDocumentPath(workspaceId)}/${FIRESTORE_COLLECTIONS.watchlists}/${watchlistId}`;
}

export function workspaceSavedViewDocumentPath(workspaceId: string, savedViewId: string): string {
  return `${workspaceDocumentPath(workspaceId)}/${FIRESTORE_COLLECTIONS.savedViews}/${savedViewId}`;
}

export function workspaceSignalsLatestDocumentPath(workspaceId: string, signalId: string): string {
  return `${workspaceDocumentPath(workspaceId)}/${FIRESTORE_COLLECTIONS.signalsLatest}/${signalId}`;
}

export function workspaceNotificationDocumentPath(
  workspaceId: string,
  notificationId: string,
): string {
  return `${workspaceDocumentPath(workspaceId)}/${FIRESTORE_COLLECTIONS.notifications}/${notificationId}`;
}

export function workspaceFeatureFlagDocumentPath(workspaceId: string, flagKey: string): string {
  return `${workspaceDocumentPath(workspaceId)}/${FIRESTORE_COLLECTIONS.featureFlags}/${flagKey}`;
}

export function workspaceBriefDocumentPath(workspaceId: string, briefId: string): string {
  return `${workspaceDocumentPath(workspaceId)}/${FIRESTORE_COLLECTIONS.briefs}/${briefId}`;
}

export function workspaceAlertRuleDocumentPath(workspaceId: string, ruleId: string): string {
  return `${workspaceDocumentPath(workspaceId)}/${FIRESTORE_COLLECTIONS.alertRules}/${ruleId}`;
}

export function workspaceMemberPreferencesPath(workspaceId: string, uid: string): string {
  return `${workspaceDocumentPath(workspaceId)}/${FIRESTORE_COLLECTIONS.memberPreferences}/${uid}`;
}

export function workspaceWatchlistsCollectionPath(workspaceId: string): string {
  return `${workspaceDocumentPath(workspaceId)}/${FIRESTORE_COLLECTIONS.watchlists}`;
}
