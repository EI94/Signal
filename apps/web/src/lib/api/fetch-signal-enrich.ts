import { getSignalApiBaseUrl } from './signal-api';

export type SignalEnrichment = {
  signalId: string;
  enrichedSummary: string | null;
  countryCodes: string[];
  cityName: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  cached: boolean;
};

export async function fetchSignalEnrichment(signalId: string): Promise<SignalEnrichment> {
  const apiBase = getSignalApiBaseUrl();
  if (!apiBase) throw new Error('API base URL not configured');

  const res = await fetch(`${apiBase}/v1/signals/${encodeURIComponent(signalId)}/enrich`);
  if (!res.ok) throw new Error(`Enrich failed: HTTP ${res.status}`);
  const json = (await res.json()) as { ok: boolean; result: SignalEnrichment };
  return json.result;
}
