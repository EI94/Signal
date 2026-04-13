import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadApiRuntimeConfig,
  loadIngestRuntimeConfig,
  loadIntelRuntimeConfig,
  parseRuntimeEnvName,
  parseServerRuntimeEnv,
} from '../index';

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return overrides as NodeJS.ProcessEnv;
}

function apiEnv(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return {
    FIREBASE_PROJECT_ID: 'test-project',
    SIGNAL_DEFAULT_WORKSPACE_ID: 'ws-default',
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe('parseRuntimeEnvName', () => {
  it('maps empty to development', () => {
    expect(parseRuntimeEnvName(undefined)).toBe('development');
    expect(parseRuntimeEnvName('')).toBe('development');
  });

  it('maps known NODE_ENV values', () => {
    expect(parseRuntimeEnvName('production')).toBe('production');
    expect(parseRuntimeEnvName('staging')).toBe('staging');
    expect(parseRuntimeEnvName('development')).toBe('development');
  });

  it('maps unknown values to development', () => {
    expect(parseRuntimeEnvName('test')).toBe('development');
  });
});

describe('loadApiRuntimeConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('loads defaults', () => {
    const c = loadApiRuntimeConfig(
      apiEnv({
        NODE_ENV: '',
        PORT: '',
        LOG_LEVEL: '',
      }),
    );
    expect(c.serviceName).toBe('api');
    expect(c.environment).toBe('development');
    expect(c.port).toBe(4000);
    expect(c.logLevel).toBe('info');
    expect(c.isProduction).toBe(false);
    expect(c.firebaseProjectId).toBe('test-project');
    expect(c.defaultWorkspaceId).toBe('ws-default');
    expect(c.publicWorkspaceId).toBe('ws-default');
    expect(c.corsOrigins).toEqual(['http://localhost:3000']);
    expect(c.bigQueryDatasetId).toBeNull();
    expect(c.bigQueryEntitySignalLinksTableId).toBe('entity_signal_links');
    expect(c.bigQueryUsageEventsTableId).toBe('usage_events');
    expect(c.healthStaleSignalsHours).toBe(48);
    expect(c.healthStaleIngestHours).toBe(24);
    expect(c.healthStaleBriefHours).toBe(72);
    expect(c.healthUsageLookbackHours).toBe(168);
    expect(c.internalHealthSecret).toBeNull();
    expect(c.toolIntelBaseUrl).toBeNull();
    expect(c.toolIntelSecret).toBeNull();
    expect(c.geminiSuggestApiKey).toBeNull();
    expect(c.geminiSuggestModel).toBe('gemini-2.0-flash');
    expect(Object.isFrozen(c)).toBe(true);
  });

  it('parses SIGNAL_PUBLIC_WORKSPACE_ID when set', () => {
    const c = loadApiRuntimeConfig(
      apiEnv({
        SIGNAL_PUBLIC_WORKSPACE_ID: 'ws-public',
      }),
    );
    expect(c.publicWorkspaceId).toBe('ws-public');
    expect(c.defaultWorkspaceId).toBe('ws-default');
  });

  it('parses SIGNAL_TOOL_INTEL_BASE_URL and SIGNAL_TOOL_INTEL_SECRET', () => {
    const c = loadApiRuntimeConfig(
      apiEnv({
        SIGNAL_TOOL_INTEL_BASE_URL: 'http://localhost:4002/',
        SIGNAL_TOOL_INTEL_SECRET: 'sec',
      }),
    );
    expect(c.toolIntelBaseUrl).toBe('http://localhost:4002');
    expect(c.toolIntelSecret).toBe('sec');
  });

  it('parses optional BigQuery dataset for serving read models', () => {
    const c = loadApiRuntimeConfig(
      apiEnv({
        SIGNAL_BIGQUERY_DATASET: 'signal_dev_analytics',
        SIGNAL_BIGQUERY_ENTITY_SIGNAL_LINKS_TABLE: 'esl_custom',
      }),
    );
    expect(c.bigQueryDatasetId).toBe('signal_dev_analytics');
    expect(c.bigQueryEntitySignalLinksTableId).toBe('esl_custom');
  });

  it('parses production and port', () => {
    const c = loadApiRuntimeConfig(
      apiEnv({
        NODE_ENV: 'production',
        PORT: '9000',
        LOG_LEVEL: 'debug',
        SIGNAL_SERVICE_VERSION: '2.0.0',
      }),
    );
    expect(c.environment).toBe('production');
    expect(c.port).toBe(9000);
    expect(c.logLevel).toBe('debug');
    expect(c.version).toBe('2.0.0');
    expect(c.isProduction).toBe(true);
  });

  it('throws without FIREBASE_PROJECT_ID', () => {
    expect(() => loadApiRuntimeConfig(env({ PORT: '4000' }))).toThrow(/FIREBASE_PROJECT_ID/);
  });

  it('throws without SIGNAL_DEFAULT_WORKSPACE_ID', () => {
    expect(() =>
      loadApiRuntimeConfig(env({ FIREBASE_PROJECT_ID: 'p', SIGNAL_DEFAULT_WORKSPACE_ID: '' })),
    ).toThrow(/SIGNAL_DEFAULT_WORKSPACE_ID/);
  });

  it('throws on invalid SIGNAL_HEALTH_STALE_SIGNALS_HOURS', () => {
    expect(() => loadApiRuntimeConfig(apiEnv({ SIGNAL_HEALTH_STALE_SIGNALS_HOURS: '0' }))).toThrow(
      /SIGNAL_HEALTH_STALE_SIGNALS_HOURS/,
    );
  });

  it('parses CORS_ORIGINS', () => {
    const c = loadApiRuntimeConfig(apiEnv({ CORS_ORIGINS: 'http://a.test,http://b.test' }));
    expect(c.corsOrigins).toEqual(['http://a.test', 'http://b.test']);
  });

  it('throws on invalid PORT', () => {
    expect(() => loadApiRuntimeConfig(apiEnv({ PORT: 'not-a-port' }))).toThrow(
      /Invalid runtime config/,
    );
  });

  it('throws on invalid LOG_LEVEL', () => {
    expect(() => loadApiRuntimeConfig(apiEnv({ LOG_LEVEL: 'verbose' }))).toThrow(/LOG_LEVEL/);
  });
});

describe('loadIngestRuntimeConfig', () => {
  it('requires FIREBASE_PROJECT_ID and sets fetch defaults', () => {
    expect(() => loadIngestRuntimeConfig(env({}))).toThrow(/FIREBASE_PROJECT_ID/);
    const ingest = loadIngestRuntimeConfig(
      env({ FIREBASE_PROJECT_ID: 'gcp-test', SIGNAL_FETCH_TIMEOUT_MS: '5000' }),
    );
    expect(ingest.port).toBe(4001);
    expect(ingest.serviceName).toBe('ingest');
    expect(ingest.firebaseProjectId).toBe('gcp-test');
    expect(ingest.fetchTimeoutMs).toBe(5000);
    expect(ingest.fetchMaxBodyBytes).toBe(10 * 1024 * 1024);
    expect(ingest.fetchUserAgent).toContain('Signal-ingest');
    expect(ingest.runOnceSecret).toBeNull();
    expect(ingest.persistenceEnabled).toBe(true);
    expect(ingest.gcsRawBucketName).toBe('gcp-test-signal-dev-raw');
    expect(ingest.bigQueryDatasetId).toBe('signal_dev_analytics');
    expect(ingest.bigQuerySourceContentsTableId).toBe('source_contents');
    expect(ingest.defaultWorkspaceId).toBeNull();
    expect(ingest.publishSourceContentEventsEnabled).toBe(false);
    expect(ingest.pubsubTopicSourceContentPersisted).toBe('source.delta.detected');
    expect(ingest.pipelineHandoffEnvelopeEnabled).toBe(true);
    expect(ingest.usageMeteringEnabled).toBe(false);
    expect(ingest.bigQueryUsageEventsTableId).toBe('usage_events');
    expect(ingest.ingestRatePolicyEnabled).toBe(true);
    expect(ingest.ingestMaxSourcesPerRun).toBe(500);
  });

  it('parses INGEST_RUN_ONCE_SECRET', () => {
    const ingest = loadIngestRuntimeConfig(
      env({ FIREBASE_PROJECT_ID: 'p', INGEST_RUN_ONCE_SECRET: 'secret' }),
    );
    expect(ingest.runOnceSecret).toBe('secret');
  });

  it('disables persistence and overrides bucket/dataset when set', () => {
    const ingest = loadIngestRuntimeConfig(
      env({
        FIREBASE_PROJECT_ID: 'myproj',
        NODE_ENV: 'production',
        SIGNAL_INGEST_PERSISTENCE_ENABLED: 'false',
        SIGNAL_GCS_RAW_BUCKET: 'custom-bucket',
        SIGNAL_BIGQUERY_DATASET: 'custom_ds',
        SIGNAL_BIGQUERY_SOURCE_CONTENTS_TABLE: 'sc_t',
        SIGNAL_DEFAULT_WORKSPACE_ID: 'ws-1',
      }),
    );
    expect(ingest.persistenceEnabled).toBe(false);
    expect(ingest.gcsRawBucketName).toBe('custom-bucket');
    expect(ingest.bigQueryDatasetId).toBe('custom_ds');
    expect(ingest.bigQuerySourceContentsTableId).toBe('sc_t');
    expect(ingest.defaultWorkspaceId).toBe('ws-1');
  });

  it('enables Pub/Sub handoff and overrides topic when set', () => {
    const ingest = loadIngestRuntimeConfig(
      env({
        FIREBASE_PROJECT_ID: 'p',
        SIGNAL_PUBLISH_SOURCE_CONTENT_EVENTS_ENABLED: 'true',
        SIGNAL_PUBSUB_TOPIC_SOURCE_CONTENT_PERSISTED: 'custom.topic',
      }),
    );
    expect(ingest.publishSourceContentEventsEnabled).toBe(true);
    expect(ingest.pubsubTopicSourceContentPersisted).toBe('custom.topic');
  });

  it('disables pipeline handoff envelope when set false', () => {
    const ingest = loadIngestRuntimeConfig(
      env({
        FIREBASE_PROJECT_ID: 'p',
        SIGNAL_PIPELINE_HANDOFF_ENVELOPE_ENABLED: 'false',
      }),
    );
    expect(ingest.pipelineHandoffEnvelopeEnabled).toBe(false);
  });

  it('enables usage metering and overrides usage events table when set', () => {
    const ingest = loadIngestRuntimeConfig(
      env({
        FIREBASE_PROJECT_ID: 'p',
        SIGNAL_USAGE_METERING_ENABLED: 'true',
        SIGNAL_BIGQUERY_USAGE_EVENTS_TABLE: 'usage_custom',
      }),
    );
    expect(ingest.usageMeteringEnabled).toBe(true);
    expect(ingest.bigQueryUsageEventsTableId).toBe('usage_custom');
  });

  it('disables ingest rate policy when explicitly false', () => {
    const ingest = loadIngestRuntimeConfig(
      env({
        FIREBASE_PROJECT_ID: 'p',
        SIGNAL_INGEST_RATE_POLICY_ENABLED: 'false',
      }),
    );
    expect(ingest.ingestRatePolicyEnabled).toBe(false);
  });

  it('parses SIGNAL_INGEST_MAX_SOURCES_PER_RUN', () => {
    const ingest = loadIngestRuntimeConfig(
      env({
        FIREBASE_PROJECT_ID: 'p',
        SIGNAL_INGEST_MAX_SOURCES_PER_RUN: '42',
      }),
    );
    expect(ingest.ingestMaxSourcesPerRun).toBe(42);
  });
});

describe('loadIntelRuntimeConfig', () => {
  it('requires FIREBASE_PROJECT_ID and sets GCS/BQ defaults', () => {
    expect(() => loadIntelRuntimeConfig(env({}))).toThrow(/FIREBASE_PROJECT_ID/);
    const intel = loadIntelRuntimeConfig(env({ FIREBASE_PROJECT_ID: 'gcp-intel' }));
    expect(intel.port).toBe(4002);
    expect(intel.serviceName).toBe('intel');
    expect(intel.firebaseProjectId).toBe('gcp-intel');
    expect(intel.gcsRawBucketName).toBe('gcp-intel-signal-dev-raw');
    expect(intel.bigQueryDatasetId).toBe('signal_dev_analytics');
    expect(intel.bigQuerySourceContentsTableId).toBe('source_contents');
    expect(intel.normalizedWritesEnabled).toBe(true);
    expect(intel.intelInternalSecret).toBeNull();
    expect(intel.eventExtractionEnabled).toBe(false);
    expect(intel.maxNormalizedTextCharsForExtraction).toBe(500_000);
    expect(intel.bigQueryExtractedEventsTableId).toBe('extracted_events');
    expect(intel.signalPromotionEnabled).toBe(false);
    expect(intel.bigQuerySignalsTableId).toBe('signals');
    expect(intel.bigQuerySignalScoreHistoryTableId).toBe('signal_score_history');
    expect(intel.bigQueryEntitySignalLinksTableId).toBe('entity_signal_links');
    expect(intel.defaultWorkspaceId).toBeNull();
    expect(intel.toolIngestBaseUrl).toBeNull();
    expect(intel.toolIngestRunOnceSecret).toBeNull();
    expect(intel.perplexityEnabled).toBe(false);
    expect(intel.perplexityApiKey).toBeNull();
    expect(intel.perplexityBaseUrl).toBe('https://api.perplexity.ai');
    expect(intel.perplexityModel).toBe('sonar');
    expect(intel.perplexityTimeoutMs).toBe(45_000);
    expect(intel.briefGenerationEnabled).toBe(false);
    expect(intel.briefLookbackHours).toBe(48);
    expect(intel.briefEnrichmentEnabled).toBe(false);
    expect(intel.bigQueryBriefRunsTableId).toBe('brief_runs');
    expect(intel.userAlertStoryCooldownDays).toBe(7);
    expect(intel.resendEnabled).toBe(false);
    expect(intel.resendApiKey).toBeNull();
    expect(intel.resendFromEmail).toBeNull();
    expect(intel.resendFromName).toBeNull();
    expect(intel.resendReplyTo).toBeNull();
    expect(intel.resendTimeoutMs).toBe(30_000);
    expect(intel.briefMaxEnrichmentCalls).toBe(1);
    expect(intel.emailMaxRecipientsPerRequest).toBe(20);
    expect(intel.usageMeteringEnabled).toBe(false);
    expect(intel.bigQueryUsageEventsTableId).toBe('usage_events');
    expect(intel.monitoringGeoDenyWhenNoSourceLinked).toBe(false);
  });

  it('requires SIGNAL_RESEND_API_KEY when SIGNAL_RESEND_ENABLED is true', () => {
    expect(() =>
      loadIntelRuntimeConfig(env({ FIREBASE_PROJECT_ID: 'p', SIGNAL_RESEND_ENABLED: 'true' })),
    ).toThrow(/SIGNAL_RESEND_API_KEY/);
  });

  it('requires SIGNAL_RESEND_FROM_EMAIL when Resend is enabled with API key', () => {
    expect(() =>
      loadIntelRuntimeConfig(
        env({
          FIREBASE_PROJECT_ID: 'p',
          SIGNAL_RESEND_ENABLED: 'true',
          SIGNAL_RESEND_API_KEY: 're_test',
        }),
      ),
    ).toThrow(/SIGNAL_RESEND_FROM_EMAIL/);
  });

  it('requires SIGNAL_PERPLEXITY_API_KEY when SIGNAL_PERPLEXITY_ENABLED is true', () => {
    expect(() =>
      loadIntelRuntimeConfig(env({ FIREBASE_PROJECT_ID: 'p', SIGNAL_PERPLEXITY_ENABLED: 'true' })),
    ).toThrow(/SIGNAL_PERPLEXITY_API_KEY/);
  });

  it('parses Perplexity options when enabled', () => {
    const intel = loadIntelRuntimeConfig(
      env({
        FIREBASE_PROJECT_ID: 'p',
        SIGNAL_PERPLEXITY_ENABLED: 'true',
        SIGNAL_PERPLEXITY_API_KEY: 'pk-test',
        SIGNAL_PERPLEXITY_BASE_URL: 'https://api.perplexity.ai/',
        SIGNAL_PERPLEXITY_MODEL: 'sonar-pro',
        SIGNAL_PERPLEXITY_TIMEOUT_MS: '12000',
      }),
    );
    expect(intel.perplexityEnabled).toBe(true);
    expect(intel.perplexityApiKey).toBe('pk-test');
    expect(intel.perplexityBaseUrl).toBe('https://api.perplexity.ai');
    expect(intel.perplexityModel).toBe('sonar-pro');
    expect(intel.perplexityTimeoutMs).toBe(12_000);
  });

  it('parses internal tool ingest URL and optional secret for fetch_source', () => {
    const intel = loadIntelRuntimeConfig(
      env({
        FIREBASE_PROJECT_ID: 'p',
        SIGNAL_TOOL_INGEST_BASE_URL: 'http://localhost:4001',
        SIGNAL_TOOL_INGEST_RUN_ONCE_SECRET: 'ingest-secret',
      }),
    );
    expect(intel.toolIngestBaseUrl).toBe('http://localhost:4001');
    expect(intel.toolIngestRunOnceSecret).toBe('ingest-secret');
  });

  it('throws on invalid SIGNAL_EMAIL_MAX_RECIPIENTS_PER_REQUEST', () => {
    expect(() =>
      loadIntelRuntimeConfig(
        env({
          FIREBASE_PROJECT_ID: 'p',
          SIGNAL_EMAIL_MAX_RECIPIENTS_PER_REQUEST: '21',
        }),
      ),
    ).toThrow(/SIGNAL_EMAIL_MAX_RECIPIENTS_PER_REQUEST/);
  });

  it('parses SIGNAL_BRIEF_MAX_ENRICHMENT_CALLS', () => {
    const intel = loadIntelRuntimeConfig(
      env({
        FIREBASE_PROJECT_ID: 'p',
        SIGNAL_BRIEF_MAX_ENRICHMENT_CALLS: '0',
      }),
    );
    expect(intel.briefMaxEnrichmentCalls).toBe(0);
  });

  it('disables normalized writes and parses internal secret when set', () => {
    const intel = loadIntelRuntimeConfig(
      env({
        FIREBASE_PROJECT_ID: 'p',
        SIGNAL_INTEL_NORMALIZED_WRITES_ENABLED: 'false',
        INTEL_INTERNAL_SECRET: 'sec',
      }),
    );
    expect(intel.normalizedWritesEnabled).toBe(false);
    expect(intel.intelInternalSecret).toBe('sec');
  });

  it('enables event extraction and max text size when set', () => {
    const intel = loadIntelRuntimeConfig(
      env({
        FIREBASE_PROJECT_ID: 'p',
        SIGNAL_INTEL_EVENT_EXTRACTION_ENABLED: 'true',
        SIGNAL_INTEL_EXTRACTION_MAX_TEXT_CHARS: '10000',
        SIGNAL_BIGQUERY_EXTRACTED_EVENTS_TABLE: 'extracted_events_custom',
      }),
    );
    expect(intel.eventExtractionEnabled).toBe(true);
    expect(intel.maxNormalizedTextCharsForExtraction).toBe(10_000);
    expect(intel.bigQueryExtractedEventsTableId).toBe('extracted_events_custom');
  });

  it('enables signal promotion and BQ table overrides when set', () => {
    const intel = loadIntelRuntimeConfig(
      env({
        FIREBASE_PROJECT_ID: 'p',
        SIGNAL_INTEL_SIGNAL_PROMOTION_ENABLED: 'true',
        SIGNAL_BIGQUERY_SIGNALS_TABLE: 'signals_x',
        SIGNAL_BIGQUERY_SIGNAL_SCORE_HISTORY_TABLE: 'ssh_x',
        SIGNAL_BIGQUERY_ENTITY_SIGNAL_LINKS_TABLE: 'esl_x',
        SIGNAL_DEFAULT_WORKSPACE_ID: 'ws-default',
      }),
    );
    expect(intel.signalPromotionEnabled).toBe(true);
    expect(intel.bigQuerySignalsTableId).toBe('signals_x');
    expect(intel.bigQuerySignalScoreHistoryTableId).toBe('ssh_x');
    expect(intel.bigQueryEntitySignalLinksTableId).toBe('esl_x');
    expect(intel.defaultWorkspaceId).toBe('ws-default');
  });
});

describe('parseServerRuntimeEnv', () => {
  it('prefers SIGNAL_SERVICE_VERSION over npm_package_version', () => {
    const c = parseServerRuntimeEnv({
      serviceName: 'api',
      defaultPort: 4000,
      env: env({
        SIGNAL_SERVICE_VERSION: '1.2.3',
        npm_package_version: '9.9.9',
      }),
    });
    expect(c.version).toBe('1.2.3');
  });

  it('falls back to npm_package_version then 0.0.0', () => {
    const c = parseServerRuntimeEnv({
      serviceName: 'api',
      defaultPort: 4000,
      env: env({ npm_package_version: '0.1.0' }),
    });
    expect(c.version).toBe('0.1.0');
  });
});
