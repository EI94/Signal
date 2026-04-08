import { describe, expect, it } from 'vitest';
import { HealthSummaryV1Schema } from '../health-slo';

describe('HealthSummaryV1Schema', () => {
  it('accepts a minimal valid payload', () => {
    const r = HealthSummaryV1Schema.safeParse({
      service: 'api',
      environment: 'development',
      generatedAt: new Date().toISOString(),
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
      usageEventsQuery: { attempted: false, ok: false, reason: 'bigquery_not_configured' },
      warnings: [],
    });
    expect(r.success).toBe(true);
  });
});
