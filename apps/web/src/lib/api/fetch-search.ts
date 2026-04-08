import type { SearchV1Response } from '@signal/contracts';
import { getSignalApiBaseUrl } from './signal-api';

export async function fetchSearch(query: string, windowHours?: number): Promise<SearchV1Response> {
  const apiBase = getSignalApiBaseUrl();
  if (!apiBase) throw new Error('API base URL not configured');

  const params = new URLSearchParams();
  params.set('q', query);
  if (windowHours) params.set('windowHours', String(windowHours));

  const res = await fetch(`${apiBase}/v1/search?${params.toString()}`);
  if (!res.ok) throw new Error(`Search fetch failed: HTTP ${res.status}`);
  return (await res.json()) as SearchV1Response;
}
