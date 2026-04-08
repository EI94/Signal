/**
 * WS10.3 — curated wire-shape checks for cross-service boundaries (not exhaustive schema tests).
 * Complements api-serving-v1.test.ts and ingest-fetch-outcome tests.
 */
import { describe, expect, it } from 'vitest';
import { SignalToolExecutionResponseSchema } from '../agent-orchestrator';
import { EvaluateAlertsResponseSchema } from '../alert-rules-engine';
import { SendEmailDeliveryResponseSchema } from '../email-delivery';
import { HealthSummaryV1Schema } from '../health-slo';
import { UsageMeteringRowSchema } from '../usage-metering';

describe('critical path wire compatibility', () => {
  it('HealthSummaryV1 matches api internal health payload shape', () => {
    const r = HealthSummaryV1Schema.safeParse({
      service: 'api',
      environment: 'development',
      generatedAt: '2026-04-05T12:00:00.000Z',
      process: { status: 'healthy' },
      readiness: { status: 'ready', firestoreOk: true, reason: null },
      thresholdsHours: { signalsLatest: 48, ingestRun: 24, briefDocument: 72 },
      freshness: {
        signalsLatestDetectedAt: null,
        briefLatestUpdatedAt: null,
        lastIngestRunAt: null,
        lastPromoteCompleteAt: null,
        lastBriefGenerateCompleteAt: null,
        lastAlertsEvaluateCompleteAt: null,
      },
      stale: { signalsLatest: true, ingestRun: true, briefDocument: true },
      usageEventsQuery: { attempted: false, ok: false, reason: null },
      warnings: [],
    });
    expect(r.success).toBe(true);
  });

  it('UsageMeteringRow remains BigQuery streaming shape', () => {
    const r = UsageMeteringRowSchema.safeParse({
      usage_event_id: 'a'.repeat(32),
      event_type: 'ingest.run.complete',
      workspace_id: 'ws1',
      service_name: 'ingest',
      provider: null,
      outcome: 'ok',
      quantity: 3,
      unit: 'count',
      related_object_id: null,
      metadata_json: { summary: { processed: 3 } },
      occurred_at: new Date('2026-04-05T10:00:00.000Z'),
      created_at: new Date('2026-04-05T10:00:01.000Z'),
    });
    expect(r.success).toBe(true);
  });

  it('SignalToolExecutionResponse envelope for orchestrator', () => {
    const r = SignalToolExecutionResponseSchema.safeParse({
      status: 'success',
      tool: 'fetch_source',
      durationMs: 120,
      output: { ok: true, runAt: '2026-04-05T12:00:00.000Z', summary: { processed: 1 } },
    });
    expect(r.success).toBe(true);
  });

  it('EvaluateAlertsResponse', () => {
    const r = EvaluateAlertsResponseSchema.safeParse({
      signalId: 'sig-1',
      evaluations: [{ alertRuleId: 'rule-1', outcome: 'no_match', reasonCode: null }],
    });
    expect(r.success).toBe(true);
  });

  it('SendEmailDeliveryResponse', () => {
    const r = SendEmailDeliveryResponseSchema.safeParse({
      deliveryId: 'd1',
      status: 'sent',
      providerMessageId: 'pm1',
    });
    expect(r.success).toBe(true);
  });
});
