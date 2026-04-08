import type { IntelRuntimeConfig } from '@signal/config';
import type {
  EvaluateAlertsResponse,
  SignalInternalToolName,
  SignalToolExecutionStatus,
  UsageMeteringOutcome,
} from '@signal/contracts';
import { buildUsageMeteringEventId } from './build-usage-metering-event-id';
import { insertUsageMeteringRows } from './insert-usage-metering-rows';
import type { ExtractSourceContentResult } from './process-extract-source-content';
import type { PromoteSourceContentSignalsResult } from './process-promote-source-content-signals';
import type { ProcessSourceContentPersistedResult } from './process-source-content-persisted';

export async function recordIntelUsageMeteringSafe(
  config: IntelRuntimeConfig,
  rowInput: {
    readonly eventType: import('@signal/contracts').UsageMeteringEventType;
    readonly workspaceId: string | null;
    readonly provider: string | null;
    readonly outcome: UsageMeteringOutcome;
    readonly quantity: number;
    readonly unit: import('@signal/contracts').UsageMeteringUnit;
    readonly relatedObjectId: string | null;
    readonly metadataJson: Record<string, unknown> | null;
    readonly occurredAt: Date;
    readonly dedupeKey: string;
  },
  log?: { warn: (o: Record<string, unknown>, m: string) => void },
): Promise<void> {
  if (!config.usageMeteringEnabled) return;

  const occurredAtIso = rowInput.occurredAt.toISOString();
  const usage_event_id = buildUsageMeteringEventId({
    serviceName: 'intel',
    eventType: rowInput.eventType,
    occurredAtIso,
    dedupeKey: rowInput.dedupeKey,
  });

  const createdAt = new Date();

  try {
    await insertUsageMeteringRows({
      projectId: config.firebaseProjectId,
      datasetId: config.bigQueryDatasetId,
      tableId: config.bigQueryUsageEventsTableId,
      rows: [
        {
          usage_event_id,
          event_type: rowInput.eventType,
          workspace_id: rowInput.workspaceId,
          service_name: 'intel',
          provider: rowInput.provider,
          outcome: rowInput.outcome,
          quantity: rowInput.quantity,
          unit: rowInput.unit,
          related_object_id: rowInput.relatedObjectId,
          metadata_json: rowInput.metadataJson,
          occurred_at: rowInput.occurredAt,
          created_at: createdAt,
        },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (log) {
      log.warn({ err: message, eventType: rowInput.eventType }, 'usage meter insert failed');
    } else {
      console.warn('usage meter insert failed', message);
    }
  }
}

export async function meterIntelNormalization(
  config: IntelRuntimeConfig,
  result: ProcessSourceContentPersistedResult,
  workspaceId: string | null,
  log?: { warn: (o: Record<string, unknown>, m: string) => void },
): Promise<void> {
  const occurredAt = new Date();
  await recordIntelUsageMeteringSafe(
    config,
    {
      eventType: 'intel.normalization.complete',
      workspaceId,
      provider: null,
      outcome: 'ok',
      quantity: 1,
      unit: 'count',
      relatedObjectId: result.sourceContentId,
      metadataJson: {
        extractionStatus: result.extractionStatus,
        manifestValidated: result.manifestValidated,
      },
      occurredAt,
      dedupeKey: `norm:${result.sourceContentId}:${occurredAt.toISOString().slice(0, 19)}`,
    },
    log,
  );
}

export async function meterIntelExtract(
  config: IntelRuntimeConfig,
  result: ExtractSourceContentResult,
  workspaceId: string | null,
  sourceContentIdHint: string,
  log?: { warn: (o: Record<string, unknown>, m: string) => void },
): Promise<void> {
  const occurredAt = new Date();
  if (result.ok && result.skipped) {
    await recordIntelUsageMeteringSafe(
      config,
      {
        eventType: 'intel.extract.complete',
        workspaceId,
        provider: null,
        outcome: 'skipped',
        quantity: 0,
        unit: 'count',
        relatedObjectId: sourceContentIdHint,
        metadataJson: { reason: result.reason },
        occurredAt,
        dedupeKey: `extract:skip:${sourceContentIdHint}:${result.reason}`,
      },
      log,
    );
    return;
  }

  if (!result.ok || result.skipped) return;

  await recordIntelUsageMeteringSafe(
    config,
    {
      eventType: 'intel.extract.complete',
      workspaceId,
      provider: null,
      outcome: 'ok',
      quantity: result.extractedEventCount,
      unit: 'count',
      relatedObjectId: result.sourceContentId,
      metadataJson: { extractionStatus: result.extractionStatus },
      occurredAt,
      dedupeKey: `extract:${result.sourceContentId}:${occurredAt.toISOString().slice(0, 19)}`,
    },
    log,
  );
}

export async function meterIntelExtractFailure(
  config: IntelRuntimeConfig,
  workspaceId: string | null,
  sourceContentId: string,
  errorMessage: string,
  log?: { warn: (o: Record<string, unknown>, m: string) => void },
): Promise<void> {
  const occurredAt = new Date();
  await recordIntelUsageMeteringSafe(
    config,
    {
      eventType: 'intel.extract.complete',
      workspaceId,
      provider: null,
      outcome: 'failed',
      quantity: 0,
      unit: 'count',
      relatedObjectId: sourceContentId,
      metadataJson: { errorMessage: errorMessage.slice(0, 500) },
      occurredAt,
      dedupeKey: `extract:fail:${sourceContentId}:${occurredAt.getTime()}`,
    },
    log,
  );
}

export async function meterIntelPromote(
  config: IntelRuntimeConfig,
  result: PromoteSourceContentSignalsResult,
  workspaceId: string | null,
  sourceContentIdHint: string,
  log?: { warn: (o: Record<string, unknown>, m: string) => void },
): Promise<void> {
  const occurredAt = new Date();
  if (result.ok && result.skipped) {
    await recordIntelUsageMeteringSafe(
      config,
      {
        eventType: 'intel.promote.complete',
        workspaceId,
        provider: null,
        outcome: 'skipped',
        quantity: 0,
        unit: 'count',
        relatedObjectId: sourceContentIdHint,
        metadataJson: { reason: result.reason },
        occurredAt,
        dedupeKey: `promote:skip:${sourceContentIdHint}:${result.reason}`,
      },
      log,
    );
    return;
  }

  if (!result.ok || result.skipped) return;

  await recordIntelUsageMeteringSafe(
    config,
    {
      eventType: 'intel.promote.complete',
      workspaceId,
      provider: null,
      outcome: 'ok',
      quantity: result.promotedSignalCount,
      unit: 'count',
      relatedObjectId: result.sourceContentId,
      metadataJson: { extractionStatus: result.extractionStatus },
      occurredAt,
      dedupeKey: `promote:${result.sourceContentId}:${occurredAt.toISOString().slice(0, 19)}`,
    },
    log,
  );
}

export async function meterIntelPromoteFailure(
  config: IntelRuntimeConfig,
  workspaceId: string | null,
  sourceContentId: string,
  errorMessage: string,
  log?: { warn: (o: Record<string, unknown>, m: string) => void },
): Promise<void> {
  const occurredAt = new Date();
  await recordIntelUsageMeteringSafe(
    config,
    {
      eventType: 'intel.promote.complete',
      workspaceId,
      provider: null,
      outcome: 'failed',
      quantity: 0,
      unit: 'count',
      relatedObjectId: sourceContentId,
      metadataJson: { errorMessage: errorMessage.slice(0, 500) },
      occurredAt,
      dedupeKey: `promote:fail:${sourceContentId}:${occurredAt.getTime()}`,
    },
    log,
  );
}

export async function meterIntelAlerts(
  config: IntelRuntimeConfig,
  result: EvaluateAlertsResponse,
  workspaceId: string,
  signalId: string,
  log?: { warn: (o: Record<string, unknown>, m: string) => void },
): Promise<void> {
  const occurredAt = new Date();
  const fired = result.evaluations.filter((e) => e.outcome === 'fired').length;
  await recordIntelUsageMeteringSafe(
    config,
    {
      eventType: 'intel.alerts.evaluate.complete',
      workspaceId,
      provider: null,
      outcome: 'ok',
      quantity: result.evaluations.length,
      unit: 'count',
      relatedObjectId: signalId,
      metadataJson: {
        evaluationCount: result.evaluations.length,
        firedCount: fired,
      },
      occurredAt,
      dedupeKey: `alerts:${workspaceId}:${signalId}:${occurredAt.toISOString().slice(0, 19)}`,
    },
    log,
  );
}

export async function meterIntelBriefGenerate(
  config: IntelRuntimeConfig,
  params: {
    readonly workspaceId: string;
    readonly briefId: string;
    readonly sourceSignalCount: number;
    readonly modelAssisted: boolean;
    readonly markdownChars: number;
  },
  log?: { warn: (o: Record<string, unknown>, m: string) => void },
): Promise<void> {
  const occurredAt = new Date();
  await recordIntelUsageMeteringSafe(
    config,
    {
      eventType: 'intel.brief.generate.complete',
      workspaceId: params.workspaceId,
      provider: null,
      outcome: 'ok',
      quantity: 1,
      unit: 'count',
      relatedObjectId: params.briefId,
      metadataJson: {
        sourceSignalCount: params.sourceSignalCount,
        modelAssisted: params.modelAssisted,
        markdownChars: params.markdownChars,
      },
      occurredAt,
      dedupeKey: `brief:${params.briefId}`,
    },
    log,
  );
}

export async function meterIntelEmailSend(
  config: IntelRuntimeConfig,
  params: {
    readonly workspaceId: string;
    readonly kind: 'alert' | 'brief';
    readonly status: 'sent' | 'failed' | 'skipped';
    readonly deliveryId: string;
  },
  log?: { warn: (o: Record<string, unknown>, m: string) => void },
): Promise<void> {
  const occurredAt = new Date();
  const outcome: UsageMeteringOutcome =
    params.status === 'sent' ? 'ok' : params.status === 'skipped' ? 'skipped' : 'failed';
  await recordIntelUsageMeteringSafe(
    config,
    {
      eventType: 'intel.email.send',
      workspaceId: params.workspaceId,
      provider: 'resend',
      outcome,
      quantity: 1,
      unit: 'count',
      relatedObjectId: params.deliveryId,
      metadataJson: { kind: params.kind },
      occurredAt,
      dedupeKey: `email:${params.deliveryId}`,
    },
    log,
  );
}

export async function meterIntelToolExecute(
  config: IntelRuntimeConfig,
  params: {
    readonly workspaceId: string | null;
    readonly tool: SignalInternalToolName | undefined;
    readonly status: SignalToolExecutionStatus;
    readonly durationMs: number;
    readonly correlationId?: string;
    readonly idempotencyKey?: string;
  },
  log?: { warn: (o: Record<string, unknown>, m: string) => void },
): Promise<void> {
  const occurredAt = new Date();
  const outcome: UsageMeteringOutcome =
    params.status === 'success' ? 'ok' : params.status === 'unavailable' ? 'skipped' : 'failed';
  await recordIntelUsageMeteringSafe(
    config,
    {
      eventType: 'intel.tool.execute',
      workspaceId: params.workspaceId,
      provider: null,
      outcome,
      quantity: params.durationMs,
      unit: 'ms',
      relatedObjectId: params.tool ?? null,
      metadataJson: {
        tool: params.tool ?? null,
        status: params.status,
        ...(params.correlationId ? { correlationId: params.correlationId } : {}),
        ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
      },
      occurredAt,
      dedupeKey: [
        params.tool ?? 'unknown',
        params.correlationId ?? '',
        params.idempotencyKey ?? '',
        String(params.durationMs),
        occurredAt.toISOString().slice(0, 23),
      ].join(':'),
    },
    log,
  );
}

export async function meterIntelPerplexity(
  config: IntelRuntimeConfig,
  params: {
    readonly outcome: UsageMeteringOutcome;
    readonly durationMs: number;
    readonly sourceContentId?: string;
  },
  log?: { warn: (o: Record<string, unknown>, m: string) => void },
): Promise<void> {
  const occurredAt = new Date();
  await recordIntelUsageMeteringSafe(
    config,
    {
      eventType: 'intel.provider.perplexity',
      workspaceId: null,
      provider: 'perplexity',
      outcome: params.outcome,
      quantity: 1,
      unit: 'count',
      relatedObjectId: params.sourceContentId ?? null,
      metadataJson: { durationMs: params.durationMs },
      occurredAt,
      dedupeKey: `pplx:${occurredAt.getTime()}:${params.durationMs}`,
    },
    log,
  );
}
