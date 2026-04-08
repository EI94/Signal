import type { PulseV1Response } from '@signal/contracts';
import { getSignalApiBaseUrl } from './signal-api';

export async function fetchPulse(windowHours: number, country?: string): Promise<PulseV1Response> {
  const apiBase = getSignalApiBaseUrl();
  if (!apiBase) throw new Error('API base URL not configured');

  const params = new URLSearchParams();
  params.set('windowHours', String(windowHours));
  if (country) params.set('country', country);

  const res = await fetch(`${apiBase}/v1/pulse?${params.toString()}`);
  if (!res.ok) throw new Error(`Pulse fetch failed: HTTP ${res.status}`);
  return (await res.json()) as PulseV1Response;
}
