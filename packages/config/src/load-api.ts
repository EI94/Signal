import { parseServerRuntimeEnv } from './server-runtime';
import type { ApiRuntimeConfig } from './types';

function parseCorsOrigins(raw: string | undefined): readonly string[] {
  const s = raw?.trim();
  if (!s) return ['http://localhost:3000'];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function loadApiRuntimeConfig(env: NodeJS.ProcessEnv = process.env): ApiRuntimeConfig {
  const base = parseServerRuntimeEnv({ serviceName: 'api', defaultPort: 4000, env });

  const firebaseProjectId = env.FIREBASE_PROJECT_ID?.trim();
  if (!firebaseProjectId) {
    throw new Error(
      'Invalid runtime config: FIREBASE_PROJECT_ID is required for apps/api (Firebase Admin).',
    );
  }

  const corsOrigins = parseCorsOrigins(env.CORS_ORIGINS);

  const defaultWorkspaceId = env.SIGNAL_DEFAULT_WORKSPACE_ID?.trim();
  if (!defaultWorkspaceId) {
    throw new Error(
      'Invalid runtime config: SIGNAL_DEFAULT_WORKSPACE_ID is required (Firestore workspace id for membership resolution).',
    );
  }

  const publicWorkspaceRaw = env.SIGNAL_PUBLIC_WORKSPACE_ID?.trim();
  const publicWorkspaceId =
    publicWorkspaceRaw && publicWorkspaceRaw.length > 0 ? publicWorkspaceRaw : defaultWorkspaceId;

  const bigQueryDatasetRaw = env.SIGNAL_BIGQUERY_DATASET?.trim();
  const bigQueryDatasetId =
    bigQueryDatasetRaw && bigQueryDatasetRaw.length > 0 ? bigQueryDatasetRaw : null;
  const bigQueryEntitySignalLinksTableId =
    env.SIGNAL_BIGQUERY_ENTITY_SIGNAL_LINKS_TABLE?.trim() || 'entity_signal_links';

  const bigQueryUsageEventsTableId =
    env.SIGNAL_BIGQUERY_USAGE_EVENTS_TABLE?.trim() || 'usage_events';

  const healthStaleSignalsHours = parsePositiveIntEnv(
    env.SIGNAL_HEALTH_STALE_SIGNALS_HOURS,
    48,
    'SIGNAL_HEALTH_STALE_SIGNALS_HOURS',
  );
  const healthStaleIngestHours = parsePositiveIntEnv(
    env.SIGNAL_HEALTH_STALE_INGEST_HOURS,
    24,
    'SIGNAL_HEALTH_STALE_INGEST_HOURS',
  );
  const healthStaleBriefHours = parsePositiveIntEnv(
    env.SIGNAL_HEALTH_STALE_BRIEF_HOURS,
    72,
    'SIGNAL_HEALTH_STALE_BRIEF_HOURS',
  );
  const healthUsageLookbackHours = parsePositiveIntEnv(
    env.SIGNAL_HEALTH_USAGE_LOOKBACK_HOURS,
    168,
    'SIGNAL_HEALTH_USAGE_LOOKBACK_HOURS',
  );

  const internalHealthRaw = env.SIGNAL_INTERNAL_HEALTH_SECRET?.trim();
  const internalHealthSecret =
    internalHealthRaw && internalHealthRaw.length > 0 ? internalHealthRaw : null;

  const toolIntelBaseUrlRaw = env.SIGNAL_TOOL_INTEL_BASE_URL?.trim();
  const toolIntelBaseUrl =
    toolIntelBaseUrlRaw && toolIntelBaseUrlRaw.length > 0
      ? toolIntelBaseUrlRaw.replace(/\/+$/, '')
      : null;

  const toolIntelSecretRaw = env.SIGNAL_TOOL_INTEL_SECRET?.trim();
  const toolIntelSecret =
    toolIntelSecretRaw && toolIntelSecretRaw.length > 0 ? toolIntelSecretRaw : null;

  const geminiSuggestKeyRaw = env.SIGNAL_GEMINI_SUGGEST_API_KEY?.trim();
  const geminiSuggestApiKey =
    geminiSuggestKeyRaw && geminiSuggestKeyRaw.length > 0 ? geminiSuggestKeyRaw : null;
  const geminiSuggestModel = env.SIGNAL_GEMINI_SUGGEST_MODEL?.trim() || 'gemini-2.0-flash';

  return Object.freeze({
    ...base,
    firebaseProjectId,
    corsOrigins,
    defaultWorkspaceId,
    publicWorkspaceId,
    bigQueryDatasetId,
    bigQueryEntitySignalLinksTableId,
    bigQueryUsageEventsTableId,
    healthStaleSignalsHours,
    healthStaleIngestHours,
    healthStaleBriefHours,
    healthUsageLookbackHours,
    internalHealthSecret,
    toolIntelBaseUrl,
    toolIntelSecret,
    geminiSuggestApiKey,
    geminiSuggestModel,
  });
}

function parsePositiveIntEnv(raw: string | undefined, defaultValue: number, label: string): number {
  const s = raw?.trim();
  if (!s) return defaultValue;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`Invalid runtime config: ${label} must be a positive integer.`);
  }
  return n;
}
