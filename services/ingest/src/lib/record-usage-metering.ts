import type { IngestRuntimeConfig } from '@signal/config';
import type { IngestRunOnceSummary } from '@signal/contracts';
import { buildUsageMeteringEventId } from './build-usage-metering-event-id';
import { insertUsageMeteringRows } from './insert-usage-metering-rows';

export async function recordIngestRunCompleteMetering(
  config: IngestRuntimeConfig,
  params: { readonly runAtIso: string; readonly summary: IngestRunOnceSummary },
  log?: { warn: (o: Record<string, unknown>, m: string) => void },
): Promise<void> {
  if (!config.usageMeteringEnabled) return;

  const occurredAt = new Date(params.runAtIso);
  const createdAt = new Date();
  const usage_event_id = buildUsageMeteringEventId({
    serviceName: 'ingest',
    eventType: 'ingest.run.complete',
    occurredAtIso: params.runAtIso,
    dedupeKey: `run:${params.runAtIso}`,
  });

  try {
    await insertUsageMeteringRows({
      projectId: config.firebaseProjectId,
      datasetId: config.bigQueryDatasetId,
      tableId: config.bigQueryUsageEventsTableId,
      rows: [
        {
          usage_event_id,
          event_type: 'ingest.run.complete',
          workspace_id: config.defaultWorkspaceId,
          service_name: 'ingest',
          provider: null,
          outcome: 'ok',
          quantity: params.summary.processed,
          unit: 'count',
          related_object_id: null,
          metadata_json: { summary: params.summary },
          occurred_at: occurredAt,
          created_at: createdAt,
        },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (log) {
      log.warn({ err: message }, 'ingest usage meter insert failed');
    } else {
      console.warn('ingest usage meter insert failed', message);
    }
  }
}
