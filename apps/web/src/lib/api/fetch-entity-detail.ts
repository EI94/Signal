import type { EntityDetailV1Response } from '@signal/contracts';

export class EntityDetailFetchError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | null,
  ) {
    super(message);
    this.name = 'EntityDetailFetchError';
  }
}

/**
 * Build the URL for GET `/v1/entities/:entityType/:entityId`.
 * Pure function — unit-tested.
 */
export function buildEntityDetailUrl(
  apiBase: string,
  entityType: string,
  entityId: string,
  timelineLimit?: number,
): string {
  const encoded = `${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;
  const params = new URLSearchParams();
  if (timelineLimit !== undefined) params.set('timelineLimit', String(timelineLimit));
  const qs = params.toString();
  return `${apiBase}/v1/entities/${encoded}${qs ? `?${qs}` : ''}`;
}

/**
 * Fetch entity detail from the serving API.
 * When `idToken` is null/undefined, calls public read-only mode (no Authorization header).
 */
export async function fetchEntityDetail(
  apiBase: string,
  idToken: string | null | undefined,
  entityType: string,
  entityId: string,
  timelineLimit?: number,
): Promise<EntityDetailV1Response> {
  const url = buildEntityDetailUrl(apiBase, entityType, entityId, timelineLimit);
  const headers: Record<string, string> = {};
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }
  const res = await fetch(url, {
    headers,
  });

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const message = extractApiErrorMessage(body) ?? `HTTP ${res.status}`;
    throw new EntityDetailFetchError(message, res.status);
  }

  return (await res.json()) as EntityDetailV1Response;
}

function extractApiErrorMessage(body: unknown): string | null {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: { message?: string } }).error;
    if (err?.message) return err.message;
  }
  return null;
}
