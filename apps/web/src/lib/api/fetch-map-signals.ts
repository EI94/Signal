import type { MapSignalsV1Response } from '@signal/contracts';

export class MapSignalsFetchError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | null,
  ) {
    super(message);
    this.name = 'MapSignalsFetchError';
  }
}

export type MapFilters = {
  signalType?: string;
  minScore?: number;
};

const DEFAULT_LIMIT = 100;

/**
 * Build the full URL for GET `/v1/map/signals`.
 * Pure function — query serialization is unit-tested.
 */
export function buildMapSignalsUrl(
  apiBase: string,
  filters: MapFilters,
  cursor?: string | null,
  limit?: number,
): string {
  const params = new URLSearchParams();
  if (filters.signalType) params.set('signalType', filters.signalType);
  if (filters.minScore !== undefined && filters.minScore > 0)
    params.set('minScore', String(filters.minScore));
  if (cursor) params.set('cursor', cursor);
  params.set('limit', String(limit ?? DEFAULT_LIMIT));
  const qs = params.toString();
  return `${apiBase}/v1/map/signals${qs ? `?${qs}` : ''}`;
}

/**
 * Fetch map-ready signal points from the serving API.
 * When `idToken` is null/undefined, calls public read-only mode (no Authorization header).
 */
export async function fetchMapSignals(
  apiBase: string,
  idToken: string | null | undefined,
  filters: MapFilters,
  cursor?: string | null,
  limit?: number,
): Promise<MapSignalsV1Response> {
  const url = buildMapSignalsUrl(apiBase, filters, cursor, limit);
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
    throw new MapSignalsFetchError(message, res.status);
  }

  return (await res.json()) as MapSignalsV1Response;
}

function extractApiErrorMessage(body: unknown): string | null {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: { message?: string } }).error;
    if (err?.message) return err.message;
  }
  return null;
}
