import type { IntelRuntimeConfig } from '@signal/config';
import type { FetchSourceToolInput } from '@signal/contracts';

import { getCloudRunAuthorizationHeader } from './cloud-run-id-token';

/**
 * Calls `services/ingest` `POST /internal/run-once` — the only supported way to run fetch
 * from intel without violating monorepo service boundaries.
 */
export async function invokeIngestRunOnceForTool(
  config: IntelRuntimeConfig,
  input: FetchSourceToolInput,
): Promise<Response> {
  const base = config.toolIngestBaseUrl;
  if (!base || base.trim() === '') {
    throw new Error('tool_ingest_base_url_not_configured');
  }
  const normalized = base.endsWith('/') ? base.slice(0, -1) : base;
  const url = `${normalized}/internal/run-once`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const secret = config.toolIngestRunOnceSecret;
  if (secret && secret.length > 0) {
    headers['x-signal-ingest-secret'] = secret;
  }
  const authz = await getCloudRunAuthorizationHeader(normalized);
  if (authz) {
    headers.authorization = authz;
  }
  return fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sourceId: input.sourceId }),
  });
}
