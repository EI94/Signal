import type { IntelRuntimeConfig } from '@signal/config';
import { describe, expect, it, vi } from 'vitest';
import type { EvaluateAlertsDeps } from './evaluate-alerts-for-signal';
import { evaluateAlertsForSignal } from './evaluate-alerts-for-signal';

const WORKSPACE = 'ws-1';
const SIGNAL_ID = 'sig-1';

function fakeConfig(over: Partial<IntelRuntimeConfig> = {}): IntelRuntimeConfig {
  return {
    serviceName: 'intel',
    environment: 'development',
    port: 4002,
    logLevel: 'info',
    version: '0.0.0',
    isProduction: false,
    firebaseProjectId: 'proj',
    gcsRawBucketName: 'b',
    bigQueryDatasetId: 'ds',
    bigQuerySourceContentsTableId: 't',
    normalizedWritesEnabled: false,
    intelInternalSecret: null,
    eventExtractionEnabled: false,
    maxNormalizedTextCharsForExtraction: 500000,
    bigQueryExtractedEventsTableId: 'ee',
    signalPromotionEnabled: false,
    bigQuerySignalsTableId: 's',
    bigQuerySignalScoreHistoryTableId: 'ssh',
    bigQueryEntitySignalLinksTableId: 'esl',
    defaultWorkspaceId: WORKSPACE,
    toolIngestBaseUrl: null,
    toolIngestRunOnceSecret: null,
    perplexityEnabled: false,
    perplexityApiKey: null,
    perplexityBaseUrl: 'https://api.perplexity.ai',
    perplexityModel: 'sonar',
    perplexityTimeoutMs: 45000,
    geminiEnabled: false,
    geminiApiKey: null,
    geminiModel: 'gemini-2.0-flash',
    geminiMaxCallsPerRun: 50,
    alertEvaluationEnabled: true,
    bigQueryAlertEvaluationsTableId: 'alert_evaluations',
    briefGenerationEnabled: false,
    briefLookbackHours: 48,
    briefEnrichmentEnabled: false,
    briefMaxEnrichmentCalls: 1,
    bigQueryBriefRunsTableId: 'brief_runs',
    userAlertStoryCooldownDays: 7,
    resendEnabled: false,
    resendApiKey: null,
    resendFromEmail: null,
    resendFromName: null,
    resendReplyTo: null,
    resendTimeoutMs: 30_000,
    emailMaxRecipientsPerRequest: 20,
    usageMeteringEnabled: false,
    bigQueryUsageEventsTableId: 'usage_events',
    ...over,
  } as IntelRuntimeConfig;
}

const SIGNAL_DATA = {
  signalId: SIGNAL_ID,
  signalType: 'project_award',
  title: 'Acme wins contract',
  shortSummary: 'EPC award',
  entityRefs: [{ entityType: 'competitor', entityId: 'acme' }],
  score: 82,
  status: 'active',
  novelty: 'new',
  occurredAt: new Date('2026-04-01'),
  detectedAt: new Date('2026-04-02'),
  updatedAt: new Date('2026-04-02'),
};

const RULE_MATCHING = {
  name: 'High-score awards',
  isActive: true,
  scope: {},
  conditions: { signalType: 'project_award', minScore: 70 },
  cooldownMinutes: 60,
  createdBy: 'admin',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-04-01'),
};

const RULE_NON_MATCHING = {
  ...RULE_MATCHING,
  name: 'Only divestments',
  conditions: { signalType: 'ma_divestment' },
};

function buildFakeDeps(
  signalData: unknown,
  rulesDocs: Array<{ id: string; data: unknown }>,
  cooldownResult = false,
): EvaluateAlertsDeps {
  const signalGet = vi.fn().mockResolvedValue({
    exists: signalData !== null,
    data: () => signalData,
  });
  const rulesGet = vi.fn().mockResolvedValue({
    empty: rulesDocs.length === 0,
    docs: rulesDocs.map((r) => ({ id: r.id, data: () => r.data })),
  });

  const fakeDb = {
    collection: () => ({
      doc: () => ({
        collection: (col: string) => {
          if (col === 'signalsLatest') {
            return { doc: () => ({ get: signalGet }) };
          }
          return { where: () => ({ limit: () => ({ get: rulesGet }) }) };
        },
      }),
    }),
  };

  return {
    getFirestoreDb: () => fakeDb as never,
    checkCooldown: vi.fn().mockResolvedValue(cooldownResult),
    insertEvaluations: vi.fn().mockResolvedValue(undefined),
  };
}

describe('evaluateAlertsForSignal', () => {
  it('returns empty evaluations when signal not found', async () => {
    const deps = buildFakeDeps(null, []);
    const result = await evaluateAlertsForSignal(
      { workspaceId: WORKSPACE, signalId: SIGNAL_ID },
      fakeConfig(),
      deps,
    );
    expect(result.evaluations).toEqual([]);
  });

  it('returns empty evaluations when no active rules', async () => {
    const deps = buildFakeDeps(SIGNAL_DATA, []);
    const result = await evaluateAlertsForSignal(
      { workspaceId: WORKSPACE, signalId: SIGNAL_ID },
      fakeConfig(),
      deps,
    );
    expect(result.evaluations).toEqual([]);
  });

  it('fires when rule conditions match and no cooldown', async () => {
    const deps = buildFakeDeps(SIGNAL_DATA, [{ id: 'rule-1', data: RULE_MATCHING }]);
    const result = await evaluateAlertsForSignal(
      { workspaceId: WORKSPACE, signalId: SIGNAL_ID },
      fakeConfig(),
      deps,
    );

    expect(result.evaluations).toHaveLength(1);
    expect(result.evaluations[0]?.outcome).toBe('fired');
    expect(result.evaluations[0]?.alertRuleId).toBe('rule-1');
    expect(deps.insertEvaluations).toHaveBeenCalledTimes(1);
  });

  it('uses run-scoped evaluation_id when evaluationRunId is set', async () => {
    const deps = buildFakeDeps(SIGNAL_DATA, [{ id: 'rule-1', data: RULE_MATCHING }]);
    await evaluateAlertsForSignal(
      {
        workspaceId: WORKSPACE,
        signalId: SIGNAL_ID,
        evaluationRunId: 'retry-1',
      },
      fakeConfig(),
      deps,
    );
    const mockInsert = deps.insertEvaluations as ReturnType<typeof vi.fn>;
    const rows = mockInsert.mock.calls[0]?.[0].rows as Array<{ evaluation_id: string }> | undefined;
    expect(rows?.[0]?.evaluation_id).toBe(
      `eval:run:v1:retry-1:${WORKSPACE}:rule-1:${SIGNAL_ID}:fired`,
    );
  });

  it('suppresses when cooldown is active', async () => {
    const deps = buildFakeDeps(SIGNAL_DATA, [{ id: 'rule-1', data: RULE_MATCHING }], true);
    const result = await evaluateAlertsForSignal(
      { workspaceId: WORKSPACE, signalId: SIGNAL_ID },
      fakeConfig(),
      deps,
    );

    expect(result.evaluations).toHaveLength(1);
    expect(result.evaluations[0]?.outcome).toBe('cooldown_suppressed');
  });

  it('no_match when conditions do not match', async () => {
    const deps = buildFakeDeps(SIGNAL_DATA, [{ id: 'rule-2', data: RULE_NON_MATCHING }]);
    const result = await evaluateAlertsForSignal(
      { workspaceId: WORKSPACE, signalId: SIGNAL_ID },
      fakeConfig(),
      deps,
    );

    expect(result.evaluations).toHaveLength(1);
    expect(result.evaluations[0]?.outcome).toBe('no_match');
    expect(result.evaluations[0]?.reasonCode).toBe('signalType_mismatch');
  });

  it('handles multiple rules with mixed outcomes', async () => {
    const deps = buildFakeDeps(SIGNAL_DATA, [
      { id: 'rule-1', data: RULE_MATCHING },
      { id: 'rule-2', data: RULE_NON_MATCHING },
    ]);
    const result = await evaluateAlertsForSignal(
      { workspaceId: WORKSPACE, signalId: SIGNAL_ID },
      fakeConfig(),
      deps,
    );

    expect(result.evaluations).toHaveLength(2);
    const outcomes = result.evaluations.map((e) => e.outcome);
    expect(outcomes).toContain('fired');
    expect(outcomes).toContain('no_match');
  });
});
