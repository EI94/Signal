import { defaultGcsRawBucketName, terraformEnvShortForSignal } from './ingest-gcs-defaults';
import { parseServerRuntimeEnv } from './server-runtime';
import type { IntelRuntimeConfig } from './types';

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    throw new Error(`Invalid integer (must be >= 1): "${raw}"`);
  }
  return n;
}

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) {
    throw new Error(`Invalid non-negative integer: "${raw}"`);
  }
  return n;
}

/** Hard cap on `to.length` for email sends; must stay within `Send*EmailRequest` schema max (20). */
function parseEmailRecipientsCap(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || n > 20) {
    throw new Error(
      `SIGNAL_EMAIL_MAX_RECIPIENTS_PER_REQUEST must be between 1 and 20 (API contract), got: "${raw}"`,
    );
  }
  return n;
}

export function loadIntelRuntimeConfig(env: NodeJS.ProcessEnv = process.env): IntelRuntimeConfig {
  const base = parseServerRuntimeEnv({ serviceName: 'intel', defaultPort: 4002, env });

  const firebaseProjectId = env.FIREBASE_PROJECT_ID?.trim();
  if (!firebaseProjectId) {
    throw new Error(
      'Invalid runtime config: FIREBASE_PROJECT_ID is required for services/intel (GCS + BigQuery).',
    );
  }

  const gcsRawBucketName =
    env.SIGNAL_GCS_RAW_BUCKET?.trim() ||
    defaultGcsRawBucketName(firebaseProjectId, base.environment);

  const short = terraformEnvShortForSignal(base.environment);
  const defaultDataset = `signal_${short}_analytics`;
  const bigQueryDatasetId = env.SIGNAL_BIGQUERY_DATASET?.trim() || defaultDataset;
  const bigQuerySourceContentsTableId =
    env.SIGNAL_BIGQUERY_SOURCE_CONTENTS_TABLE?.trim() || 'source_contents';
  const bigQueryExtractedEventsTableId =
    env.SIGNAL_BIGQUERY_EXTRACTED_EVENTS_TABLE?.trim() || 'extracted_events';

  const writesRaw = env.SIGNAL_INTEL_NORMALIZED_WRITES_ENABLED?.trim().toLowerCase();
  const normalizedWritesEnabled = writesRaw !== 'false' && writesRaw !== '0' && writesRaw !== 'no';

  const secretRaw = env.INTEL_INTERNAL_SECRET?.trim();
  const intelInternalSecret = secretRaw && secretRaw.length > 0 ? secretRaw : null;

  const extractRaw = env.SIGNAL_INTEL_EVENT_EXTRACTION_ENABLED?.trim().toLowerCase();
  const eventExtractionEnabled =
    extractRaw === 'true' || extractRaw === '1' || extractRaw === 'yes';

  const maxNormalizedTextCharsForExtraction = parsePositiveInt(
    env.SIGNAL_INTEL_EXTRACTION_MAX_TEXT_CHARS,
    500_000,
  );

  const promoteRaw = env.SIGNAL_INTEL_SIGNAL_PROMOTION_ENABLED?.trim().toLowerCase();
  const signalPromotionEnabled =
    promoteRaw === 'true' || promoteRaw === '1' || promoteRaw === 'yes';

  const bigQuerySignalsTableId = env.SIGNAL_BIGQUERY_SIGNALS_TABLE?.trim() || 'signals';
  const bigQuerySignalScoreHistoryTableId =
    env.SIGNAL_BIGQUERY_SIGNAL_SCORE_HISTORY_TABLE?.trim() || 'signal_score_history';
  const bigQueryEntitySignalLinksTableId =
    env.SIGNAL_BIGQUERY_ENTITY_SIGNAL_LINKS_TABLE?.trim() || 'entity_signal_links';

  const defaultWorkspaceRaw = env.SIGNAL_DEFAULT_WORKSPACE_ID?.trim();
  const defaultWorkspaceId =
    defaultWorkspaceRaw && defaultWorkspaceRaw.length > 0 ? defaultWorkspaceRaw : null;

  const toolIngestBaseUrlRaw = env.SIGNAL_TOOL_INGEST_BASE_URL?.trim();
  const toolIngestBaseUrl =
    toolIngestBaseUrlRaw && toolIngestBaseUrlRaw.length > 0 ? toolIngestBaseUrlRaw : null;

  const toolIngestSecretRaw = env.SIGNAL_TOOL_INGEST_RUN_ONCE_SECRET?.trim();
  const toolIngestRunOnceSecret =
    toolIngestSecretRaw && toolIngestSecretRaw.length > 0 ? toolIngestSecretRaw : null;

  const perplexityEnabledRaw = env.SIGNAL_PERPLEXITY_ENABLED?.trim().toLowerCase();
  const perplexityEnabled =
    perplexityEnabledRaw === 'true' ||
    perplexityEnabledRaw === '1' ||
    perplexityEnabledRaw === 'yes';

  let perplexityApiKey: string | null = null;
  if (perplexityEnabled) {
    const key = env.SIGNAL_PERPLEXITY_API_KEY?.trim();
    if (!key) {
      throw new Error(
        'Invalid runtime config: SIGNAL_PERPLEXITY_API_KEY is required when SIGNAL_PERPLEXITY_ENABLED is true.',
      );
    }
    perplexityApiKey = key;
  }

  const perplexityBaseUrlRaw = env.SIGNAL_PERPLEXITY_BASE_URL?.trim();
  const perplexityBaseUrl =
    perplexityBaseUrlRaw && perplexityBaseUrlRaw.length > 0
      ? perplexityBaseUrlRaw.replace(/\/+$/, '')
      : 'https://api.perplexity.ai';

  const perplexityModel = env.SIGNAL_PERPLEXITY_MODEL?.trim() || 'sonar';

  const perplexityTimeoutMs = parsePositiveInt(env.SIGNAL_PERPLEXITY_TIMEOUT_MS, 45_000);

  const alertEvalRaw = env.SIGNAL_ALERT_EVALUATION_ENABLED?.trim().toLowerCase();
  const alertEvaluationEnabled =
    alertEvalRaw === 'true' || alertEvalRaw === '1' || alertEvalRaw === 'yes';

  const bigQueryAlertEvaluationsTableId =
    env.SIGNAL_BIGQUERY_ALERT_EVALUATIONS_TABLE?.trim() || 'alert_evaluations';

  const briefGenRaw = env.SIGNAL_BRIEF_GENERATION_ENABLED?.trim().toLowerCase();
  const briefGenerationEnabled =
    briefGenRaw === 'true' || briefGenRaw === '1' || briefGenRaw === 'yes';

  const briefLookbackHours = parsePositiveInt(env.SIGNAL_BRIEF_LOOKBACK_HOURS, 48);

  const briefEnrichRaw = env.SIGNAL_BRIEF_ENRICHMENT_ENABLED?.trim().toLowerCase();
  const briefEnrichmentEnabled =
    briefEnrichRaw === 'true' || briefEnrichRaw === '1' || briefEnrichRaw === 'yes';

  const briefMaxEnrichmentCalls = parseNonNegativeInt(env.SIGNAL_BRIEF_MAX_ENRICHMENT_CALLS, 1);

  const bigQueryBriefRunsTableId = env.SIGNAL_BIGQUERY_BRIEF_RUNS_TABLE?.trim() || 'brief_runs';

  const resendEnabledRaw = env.SIGNAL_RESEND_ENABLED?.trim().toLowerCase();
  const resendEnabled =
    resendEnabledRaw === 'true' || resendEnabledRaw === '1' || resendEnabledRaw === 'yes';

  let resendApiKey: string | null = null;
  let resendFromEmail: string | null = null;
  if (resendEnabled) {
    const key = env.SIGNAL_RESEND_API_KEY?.trim();
    if (!key) {
      throw new Error(
        'Invalid runtime config: SIGNAL_RESEND_API_KEY is required when SIGNAL_RESEND_ENABLED is true.',
      );
    }
    resendApiKey = key;
    const from = env.SIGNAL_RESEND_FROM_EMAIL?.trim();
    if (!from) {
      throw new Error(
        'Invalid runtime config: SIGNAL_RESEND_FROM_EMAIL is required when SIGNAL_RESEND_ENABLED is true.',
      );
    }
    resendFromEmail = from;
  }

  const resendFromNameRaw = env.SIGNAL_RESEND_FROM_NAME?.trim();
  const resendFromName =
    resendFromNameRaw && resendFromNameRaw.length > 0 ? resendFromNameRaw : null;

  const resendReplyToRaw = env.SIGNAL_RESEND_REPLY_TO?.trim();
  const resendReplyTo = resendReplyToRaw && resendReplyToRaw.length > 0 ? resendReplyToRaw : null;

  const resendTimeoutMs = parsePositiveInt(env.SIGNAL_RESEND_TIMEOUT_MS, 30_000);

  const emailMaxRecipientsPerRequest = parseEmailRecipientsCap(
    env.SIGNAL_EMAIL_MAX_RECIPIENTS_PER_REQUEST,
    20,
  );

  const usageMeteringRaw = env.SIGNAL_USAGE_METERING_ENABLED?.trim().toLowerCase();
  const usageMeteringEnabled =
    usageMeteringRaw === 'true' || usageMeteringRaw === '1' || usageMeteringRaw === 'yes';
  const bigQueryUsageEventsTableId =
    env.SIGNAL_BIGQUERY_USAGE_EVENTS_TABLE?.trim() || 'usage_events';

  return Object.freeze({
    ...base,
    firebaseProjectId,
    gcsRawBucketName,
    bigQueryDatasetId,
    bigQuerySourceContentsTableId,
    normalizedWritesEnabled,
    intelInternalSecret,
    eventExtractionEnabled,
    maxNormalizedTextCharsForExtraction,
    bigQueryExtractedEventsTableId,
    signalPromotionEnabled,
    bigQuerySignalsTableId,
    bigQuerySignalScoreHistoryTableId,
    bigQueryEntitySignalLinksTableId,
    defaultWorkspaceId,
    toolIngestBaseUrl,
    toolIngestRunOnceSecret,
    perplexityEnabled,
    perplexityApiKey,
    perplexityBaseUrl,
    perplexityModel,
    perplexityTimeoutMs,
    alertEvaluationEnabled,
    bigQueryAlertEvaluationsTableId,
    briefGenerationEnabled,
    briefLookbackHours,
    briefEnrichmentEnabled,
    briefMaxEnrichmentCalls,
    bigQueryBriefRunsTableId,
    resendEnabled,
    resendApiKey,
    resendFromEmail,
    resendFromName,
    resendReplyTo,
    resendTimeoutMs,
    emailMaxRecipientsPerRequest,
    usageMeteringEnabled,
    bigQueryUsageEventsTableId,
  });
}
