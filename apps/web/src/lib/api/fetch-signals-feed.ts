import type { SignalsFeedV1Response } from '@signal/contracts';

export class SignalsFeedFetchError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | null,
  ) {
    super(message);
    this.name = 'SignalsFeedFetchError';
  }
}

export type FeedFilters = {
  signalType?: string;
  sort?: string;
  minScore?: number;
  novelty?: string;
  search?: string;
};

const DEFAULT_LIMIT = 25;

/**
 * Build the full URL for the signals feed endpoint.
 * Pure function — easy to test query serialization.
 */
export function buildSignalsFeedUrl(
  apiBase: string,
  filters: FeedFilters,
  cursor?: string | null,
  limit?: number,
): string {
  const params = new URLSearchParams();
  if (filters.signalType) params.set('signalType', filters.signalType);
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.minScore !== undefined && filters.minScore > 0)
    params.set('minScore', String(filters.minScore));
  if (filters.novelty) params.set('novelty', filters.novelty);
  if (cursor) params.set('cursor', cursor);
  params.set('limit', String(limit ?? DEFAULT_LIMIT));
  params.set('includeFacets', 'true');
  const qs = params.toString();
  return `${apiBase}/v1/signals${qs ? `?${qs}` : ''}`;
}

/**
 * Fetch the paginated signals feed from the serving API.
 * When `idToken` is null/undefined, calls public read-only mode (no Authorization header).
 */
export async function fetchSignalsFeed(
  apiBase: string,
  idToken: string | null | undefined,
  filters: FeedFilters,
  cursor?: string | null,
  limit?: number,
): Promise<SignalsFeedV1Response> {
  const url = buildSignalsFeedUrl(apiBase, filters, cursor, limit);
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
    throw new SignalsFeedFetchError(message, res.status);
  }

  return (await res.json()) as SignalsFeedV1Response;
}

function extractApiErrorMessage(body: unknown): string | null {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: { message?: string } }).error;
    if (err?.message) return err.message;
  }
  return null;
}
