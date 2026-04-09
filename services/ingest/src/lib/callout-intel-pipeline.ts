import type { IngestRuntimeConfig } from '@signal/config';
import type { ArchivePersistenceResult } from './archive-source-content';
import type { PersistRequestPayload } from './process-one-source';

export type PipelineCalloutResult = 'called' | 'call_failed' | 'call_skipped';

export async function calloutIntelPipeline(
  config: IngestRuntimeConfig,
  archived: ArchivePersistenceResult,
  persist: PersistRequestPayload,
): Promise<PipelineCalloutResult> {
  if (!config.pipelineCalloutEnabled || !config.intelBaseUrl) {
    return 'call_skipped';
  }

  const url = `${config.intelBaseUrl}/internal/orchestrate-pipeline`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.intelSecret) {
    headers['x-signal-intel-secret'] = config.intelSecret;
  }

  const body = JSON.stringify({
    sourceContentId: archived.sourceContentId,
    observedAt: persist.observedAt.toISOString(),
    sourceUrl: persist.source.canonicalUrl,
    sourceLabel: persist.source.name,
    publishedAt: persist.lastModified?.toISOString() ?? null,
    sourceCategory: persist.source.category ?? null,
    linkedEntityRefs: persist.source.linkedEntityRefs ?? [],
    workspaceId: config.defaultWorkspaceId,
  });

  try {
    const resp = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(120_000) });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error('[ingest→intel] orchestrate-pipeline returned %d: %s', resp.status, text.slice(0, 500));
      return 'call_failed';
    }
    const result = await resp.json();
    console.info('[ingest→intel] orchestrate-pipeline ok for %s: %j', archived.sourceContentId, result);
    return 'called';
  } catch (err) {
    console.error('[ingest→intel] orchestrate-pipeline call failed:', err instanceof Error ? err.message : err);
    return 'call_failed';
  }
}
