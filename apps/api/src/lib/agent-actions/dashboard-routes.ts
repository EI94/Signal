import type { SignalsFeedGetInput } from '@signal/contracts';

/**
 * Product-relative paths for `apps/web` App Router (WS11.3 navigation hints).
 * Query names align with GET `/v1/signals` (camelCase).
 */
export function buildSignalsDashboardRoute(filters: SignalsFeedGetInput): string {
  const p = new URLSearchParams();
  const f = filters;
  if (f.limit !== undefined) p.set('limit', String(f.limit));
  if (f.cursor) p.set('cursor', f.cursor);
  if (f.signalType) p.set('signalType', f.signalType);
  if (f.status) p.set('status', f.status);
  if (f.novelty) p.set('novelty', f.novelty);
  if (f.minScore !== undefined) p.set('minScore', String(f.minScore));
  if (f.entityType) p.set('entityType', f.entityType);
  if (f.entityId) p.set('entityId', f.entityId);
  if (f.detectedAfter) p.set('detectedAfter', f.detectedAfter);
  if (f.detectedBefore) p.set('detectedBefore', f.detectedBefore);
  if (f.occurredAfter) p.set('occurredAfter', f.occurredAfter);
  if (f.occurredBefore) p.set('occurredBefore', f.occurredBefore);
  if (f.sort) p.set('sort', f.sort);
  if (f.includeFacets !== undefined) p.set('includeFacets', String(f.includeFacets));
  const qs = p.toString();
  return qs ? `/signals?${qs}` : '/signals';
}

export function buildEntityDashboardRoute(entityType: string, entityId: string): string {
  return `/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;
}
