import { defaultGcsRawBucketName, terraformEnvShortForSignal } from './ingest-gcs-defaults';
import { parseServerRuntimeEnv } from './server-runtime';
import type { IngestRuntimeConfig } from './types';

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    throw new Error(`Invalid integer (must be >= 1): "${raw}"`);
  }
  return n;
}

export function loadIngestRuntimeConfig(env: NodeJS.ProcessEnv = process.env): IngestRuntimeConfig {
  const base = parseServerRuntimeEnv({ serviceName: 'ingest', defaultPort: 4001, env });

  const firebaseProjectId = env.FIREBASE_PROJECT_ID?.trim();
  if (!firebaseProjectId) {
    throw new Error(
      'Invalid runtime config: FIREBASE_PROJECT_ID is required for services/ingest (Firestore source registry).',
    );
  }

  const fetchTimeoutMs = parsePositiveInt(env.SIGNAL_FETCH_TIMEOUT_MS, 30_000);
  const fetchMaxBodyBytes = parsePositiveInt(env.SIGNAL_FETCH_MAX_BODY_BYTES, 10 * 1024 * 1024);
  const fetchUserAgent =
    env.SIGNAL_FETCH_USER_AGENT?.trim() || `Signal-ingest/${base.version} (+https://signal.local)`;
  const secretRaw = env.INGEST_RUN_ONCE_SECRET?.trim();
  const runOnceSecret = secretRaw && secretRaw.length > 0 ? secretRaw : null;

  const persistenceRaw = env.SIGNAL_INGEST_PERSISTENCE_ENABLED?.trim().toLowerCase();
  const persistenceEnabled =
    persistenceRaw !== 'false' && persistenceRaw !== '0' && persistenceRaw !== 'no';

  const short = terraformEnvShortForSignal(base.environment);
  const gcsRawBucketName =
    env.SIGNAL_GCS_RAW_BUCKET?.trim() ||
    defaultGcsRawBucketName(firebaseProjectId, base.environment);

  const defaultDataset = `signal_${short}_analytics`;
  const bigQueryDatasetId = env.SIGNAL_BIGQUERY_DATASET?.trim() || defaultDataset;
  const bigQuerySourceContentsTableId =
    env.SIGNAL_BIGQUERY_SOURCE_CONTENTS_TABLE?.trim() || 'source_contents';

  const defaultWorkspaceId = env.SIGNAL_DEFAULT_WORKSPACE_ID?.trim() || null;

  const publishRaw = env.SIGNAL_PUBLISH_SOURCE_CONTENT_EVENTS_ENABLED?.trim().toLowerCase();
  const publishSourceContentEventsEnabled =
    publishRaw === 'true' || publishRaw === '1' || publishRaw === 'yes';

  const pubsubTopicSourceContentPersisted =
    env.SIGNAL_PUBSUB_TOPIC_SOURCE_CONTENT_PERSISTED?.trim() || 'source.delta.detected';

  const envelopeRaw = env.SIGNAL_PIPELINE_HANDOFF_ENVELOPE_ENABLED?.trim().toLowerCase();
  const pipelineHandoffEnvelopeEnabled =
    envelopeRaw === undefined || envelopeRaw === ''
      ? true
      : envelopeRaw === 'true' || envelopeRaw === '1' || envelopeRaw === 'yes';

  const usageMeteringRaw = env.SIGNAL_USAGE_METERING_ENABLED?.trim().toLowerCase();
  const usageMeteringEnabled =
    usageMeteringRaw === 'true' || usageMeteringRaw === '1' || usageMeteringRaw === 'yes';
  const bigQueryUsageEventsTableId =
    env.SIGNAL_BIGQUERY_USAGE_EVENTS_TABLE?.trim() || 'usage_events';

  const rateRaw = env.SIGNAL_INGEST_RATE_POLICY_ENABLED?.trim().toLowerCase();
  const ingestRatePolicyEnabled = !(rateRaw === 'false' || rateRaw === '0' || rateRaw === 'no');

  const ingestMaxSourcesPerRun = parsePositiveInt(env.SIGNAL_INGEST_MAX_SOURCES_PER_RUN, 500);

  const intelBaseUrlRaw = env.SIGNAL_INTEL_BASE_URL?.trim();
  const intelBaseUrl = intelBaseUrlRaw && intelBaseUrlRaw.length > 0 ? intelBaseUrlRaw : null;

  const intelSecretRaw = env.SIGNAL_INTEL_SECRET?.trim();
  const intelSecret = intelSecretRaw && intelSecretRaw.length > 0 ? intelSecretRaw : null;

  const calloutRaw = env.SIGNAL_PIPELINE_CALLOUT_ENABLED?.trim().toLowerCase();
  const pipelineCalloutEnabled =
    calloutRaw === 'true' || calloutRaw === '1' || calloutRaw === 'yes';

  return Object.freeze({
    ...base,
    firebaseProjectId,
    fetchTimeoutMs,
    fetchMaxBodyBytes,
    fetchUserAgent,
    runOnceSecret,
    persistenceEnabled,
    gcsRawBucketName,
    bigQueryDatasetId,
    bigQuerySourceContentsTableId,
    defaultWorkspaceId:
      defaultWorkspaceId && defaultWorkspaceId.length > 0 ? defaultWorkspaceId : null,
    publishSourceContentEventsEnabled,
    pubsubTopicSourceContentPersisted,
    pipelineHandoffEnvelopeEnabled,
    usageMeteringEnabled,
    bigQueryUsageEventsTableId,
    ingestRatePolicyEnabled,
    ingestMaxSourcesPerRun,
    intelBaseUrl,
    intelSecret,
    pipelineCalloutEnabled,
  });
}
