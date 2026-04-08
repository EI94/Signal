import { loadApiRuntimeConfig } from '@signal/config';
import { describe, expect, it } from 'vitest';
import { buildHealthSummaryV1 } from './health-summary-v1';

function testConfig(overrides: Record<string, string | undefined> = {}) {
  return loadApiRuntimeConfig({
    NODE_ENV: 'development',
    FIREBASE_PROJECT_ID: 'test-proj',
    SIGNAL_DEFAULT_WORKSPACE_ID: 'ws1',
    PORT: '4000',
    LOG_LEVEL: 'silent',
    ...overrides,
  } as NodeJS.ProcessEnv);
}

describe('buildHealthSummaryV1', () => {
  it('marks all stale when timestamps are absent', () => {
    const config = testConfig();
    const now = new Date('2026-04-05T12:00:00.000Z');
    const s = buildHealthSummaryV1({
      config,
      now,
      firestoreOk: true,
      firestoreReason: null,
      signalsLatestDetectedAt: null,
      briefLatestUpdatedAt: null,
      usage: { attempted: false, ok: false, reason: null, lastByType: {} },
    });
    expect(s.stale.signalsLatest).toBe(true);
    expect(s.stale.ingestRun).toBe(true);
    expect(s.stale.briefDocument).toBe(true);
    expect(s.usageEventsQuery.attempted).toBe(false);
  });

  it('marks fresh when timestamps are recent', () => {
    const config = testConfig();
    const now = new Date('2026-04-05T12:00:00.000Z');
    const recent = new Date('2026-04-05T10:00:00.000Z');
    const s = buildHealthSummaryV1({
      config,
      now,
      firestoreOk: true,
      firestoreReason: null,
      signalsLatestDetectedAt: recent,
      briefLatestUpdatedAt: recent,
      usage: {
        attempted: true,
        ok: true,
        reason: null,
        lastByType: { 'ingest.run.complete': recent },
      },
    });
    expect(s.stale.signalsLatest).toBe(false);
    expect(s.stale.ingestRun).toBe(false);
    expect(s.stale.briefDocument).toBe(false);
  });

  it('surfaces usage_events query failure in warnings', () => {
    const config = testConfig({ SIGNAL_BIGQUERY_DATASET: 'signal_dev_analytics' });
    const now = new Date('2026-04-05T12:00:00.000Z');
    const s = buildHealthSummaryV1({
      config,
      now,
      firestoreOk: true,
      firestoreReason: null,
      signalsLatestDetectedAt: null,
      briefLatestUpdatedAt: null,
      usage: { attempted: true, ok: false, reason: 'timeout', lastByType: {} },
    });
    expect(s.warnings.some((w) => w.includes('timeout'))).toBe(true);
  });
});
