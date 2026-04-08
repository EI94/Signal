/** Aligns with NODE_ENV values we treat as first-class (unknown → development). */
export type RuntimeEnvName = 'development' | 'staging' | 'production';

/** Pino / Fastify logger levels. */
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export type ServerRuntimeConfig<S extends 'api' | 'ingest' | 'intel' = 'api' | 'ingest' | 'intel'> =
  {
    readonly serviceName: S;
    readonly environment: RuntimeEnvName;
    readonly port: number;
    readonly logLevel: LogLevel;
    /** Release or package version (SIGNAL_SERVICE_VERSION, else npm_package_version, else 0.0.0). */
    readonly version: string;
    readonly isProduction: boolean;
  };

/** API-only: Firebase Admin + CORS (see loadApiRuntimeConfig). */
export type ApiRuntimeConfig = ServerRuntimeConfig<'api'> & {
  readonly firebaseProjectId: string;
  /** Allowed browser origins for CORS (e.g. http://localhost:3000). */
  readonly corsOrigins: readonly string[];
  /**
   * Default Firestore workspace id when `X-Signal-Workspace-Id` is absent.
   * Single-tenant MVP: one workspace per environment.
   */
  readonly defaultWorkspaceId: string;
  /**
   * Workspace id for anonymous read-only serving (`GET` board/signals/map/entity when no Firebase token).
   * Defaults to `SIGNAL_DEFAULT_WORKSPACE_ID` when `SIGNAL_PUBLIC_WORKSPACE_ID` is unset.
   */
  readonly publicWorkspaceId: string;
  /**
   * When set, serving read models may query BigQuery (e.g. entity timeline).
   * When null, timeline queries are skipped; entity detail still uses Firestore window.
   */
  readonly bigQueryDatasetId: string | null;
  /** Table id within `bigQueryDatasetId` for `entity_signal_links` rows (intel defaults). */
  readonly bigQueryEntitySignalLinksTableId: string;
  /**
   * Table id for WS10.1 `usage_events` (health summary queries latest ok events when dataset is set).
   * Default `usage_events`.
   */
  readonly bigQueryUsageEventsTableId: string;
  /** Hours without a latest signal in Firestore `signalsLatest` → stale. Default 48. */
  readonly healthStaleSignalsHours: number;
  /** Hours without `ingest.run.complete` (usage_events) → stale. Default 24. */
  readonly healthStaleIngestHours: number;
  /** Hours without a brief doc update in Firestore → stale. Default 72. */
  readonly healthStaleBriefHours: number;
  /** Bound BigQuery scan for usage_events health query. Default 168 (7d). */
  readonly healthUsageLookbackHours: number;
  /**
   * When set, `GET /internal/health/summary` requires header `x-signal-internal-health-secret`.
   * When null, route is open (development only).
   */
  readonly internalHealthSecret: string | null;
  /**
   * Base URL for server-to-server calls from api → services/intel (tool exposure action tools).
   * Example `http://localhost:4002`. When null, action tools return UNAVAILABLE.
   */
  readonly toolIntelBaseUrl: string | null;
  /**
   * Optional shared secret for `x-signal-intel-secret` when calling intel (matches intel `INTEL_INTERNAL_SECRET`).
   */
  readonly toolIntelSecret: string | null;
};
export type IngestRuntimeConfig = ServerRuntimeConfig<'ingest'> & {
  readonly firebaseProjectId: string;
  /** HTTP(S) fetch timeout (ms). */
  readonly fetchTimeoutMs: number;
  /** Reject responses whose body exceeds this size after download (bytes). */
  readonly fetchMaxBodyBytes: number;
  readonly fetchUserAgent: string;
  /**
   * When set, `POST /internal/run-once` requires header `x-signal-ingest-secret` with this value.
   * When unset, the route is unsecured (development only — set in production).
   */
  readonly runOnceSecret: string | null;
  /**
   * When false, qualifying fetches update Firestore hash only (WS4.2-style); no GCS/BQ.
   * Default true when `SIGNAL_INGEST_PERSISTENCE_ENABLED` is unset.
   */
  readonly persistenceEnabled: boolean;
  /** Terraform raw archive bucket (`<project>-signal-<env>-raw`) unless overridden. */
  readonly gcsRawBucketName: string;
  /** BigQuery dataset (`signal_<env>_analytics`) unless overridden. */
  readonly bigQueryDatasetId: string;
  readonly bigQuerySourceContentsTableId: string;
  /** Optional workspace id for BigQuery `workspace_id` column (single-tenant MVP). */
  readonly defaultWorkspaceId: string | null;
  /**
   * When true, emit `SourceContentPersistedEvent` to Pub/Sub after successful GCS + BigQuery.
   * Default false so local dev does not require Pub/Sub.
   */
  readonly publishSourceContentEventsEnabled: boolean;
  /** Topic id (not full resource name); must match Terraform, default `source.delta.detected`. */
  readonly pubsubTopicSourceContentPersisted: string;
  /**
   * When true, Pub/Sub handoff publishes `PipelineHandoffEnvelopeV1` (wrapped). Intel accepts both wrapped and bare events.
   */
  readonly pipelineHandoffEnvelopeEnabled: boolean;
  /**
   * When true, append usage rows to BigQuery `usage_events` (best-effort; insert failures are logged only).
   */
  readonly usageMeteringEnabled: boolean;
  readonly bigQueryUsageEventsTableId: string;
  /**
   * When true (default), skip HTTP fetch if `lastFetchedAt` is inside the minimum interval for
   * `checkFrequencyBucket` (WS10.4).
   */
  readonly ingestRatePolicyEnabled: boolean;
  /** Max sources processed per full `run-once` (after list order). Default 500. Single-source runs ignore the cap. */
  readonly ingestMaxSourcesPerRun: number;
};
export type IntelRuntimeConfig = ServerRuntimeConfig<'intel'> & {
  readonly firebaseProjectId: string;
  /** Raw + normalized archive bucket (`<project>-signal-<env>-raw`) unless overridden. */
  readonly gcsRawBucketName: string;
  readonly bigQueryDatasetId: string;
  readonly bigQuerySourceContentsTableId: string;
  /**
   * When false, intel skips writing normalized `.txt` to GCS (local/dev); BigQuery reflects `normalization_skipped`.
   */
  readonly normalizedWritesEnabled: boolean;
  /**
   * When set, `POST /internal/source-content-persisted` requires header `x-signal-intel-secret`.
   */
  readonly intelInternalSecret: string | null;
  /** When true, `POST /internal/extract-source-content` runs deterministic extraction. */
  readonly eventExtractionEnabled: boolean;
  /** Max UTF-8 characters of normalized text passed to extractors (safety cap). */
  readonly maxNormalizedTextCharsForExtraction: number;
  readonly bigQueryExtractedEventsTableId: string;
  /** When true, `POST /internal/promote-source-content-signals` runs promotion + scoring. */
  readonly signalPromotionEnabled: boolean;
  readonly bigQuerySignalsTableId: string;
  readonly bigQuerySignalScoreHistoryTableId: string;
  readonly bigQueryEntitySignalLinksTableId: string;
  /**
   * Default workspace for Firestore `signalsLatest` and BigQuery `workspace_id` (single-tenant MVP).
   * Required when signal promotion is enabled unless `workspaceId` is always sent in the request body.
   */
  readonly defaultWorkspaceId: string | null;
  /**
   * Base URL for `fetch_source` internal tool (e.g. `http://localhost:4001`) — `POST /internal/run-once` on ingest.
   */
  readonly toolIngestBaseUrl: string | null;
  /** Optional secret header `x-signal-ingest-secret` when ingest protects run-once. */
  readonly toolIngestRunOnceSecret: string | null;
  /**
   * When true, optional enrichment tool `summarize_delta` may call Perplexity (requires API key at load time).
   * Does not affect deterministic ingest/extract/score paths.
   */
  readonly perplexityEnabled: boolean;
  /** Set when `perplexityEnabled`; null when disabled. Never exposed to clients. */
  readonly perplexityApiKey: string | null;
  /** API base URL without trailing path (default official host). */
  readonly perplexityBaseUrl: string;
  readonly perplexityModel: string;
  readonly perplexityTimeoutMs: number;
  /** When true, `POST /internal/evaluate-alerts` runs the deterministic engine. */
  readonly alertEvaluationEnabled: boolean;
  readonly bigQueryAlertEvaluationsTableId: string;
  /**
   * When true, `POST /internal/generate-brief` and `generate_brief` may run the morning brief pipeline.
   */
  readonly briefGenerationEnabled: boolean;
  /** Max hours to look back within the reporting period (intersected with UTC day bounds). */
  readonly briefLookbackHours: number;
  /**
   * When true, optional `summarize_delta` / Perplexity may tighten the executive summary block.
   * Requires `perplexityEnabled` and API key; never blocks deterministic body generation.
   */
  readonly briefEnrichmentEnabled: boolean;
  /**
   * Max optional Perplexity enrichment calls per brief generation (WS10.4). Default 1; set 0 to hard-disable enrichment.
   */
  readonly briefMaxEnrichmentCalls: number;
  /** BigQuery table id for `brief_runs` rows (intel). */
  readonly bigQueryBriefRunsTableId: string;
  /**
   * When true, `POST /internal/send-brief-email` and `POST /internal/send-alert-email` may call Resend.
   * Requires API key and from address at load time.
   */
  readonly resendEnabled: boolean;
  readonly resendApiKey: string | null;
  /** Required when `resendEnabled` (validated at load). */
  readonly resendFromEmail: string | null;
  readonly resendFromName: string | null;
  readonly resendReplyTo: string | null;
  readonly resendTimeoutMs: number;
  /**
   * Hard cap on `to.length` for send-brief / send-alert emails (WS10.4). Must be ≤ API contract max (20).
   */
  readonly emailMaxRecipientsPerRequest: number;
  /**
   * When true, append usage rows to BigQuery `usage_events` (best-effort; insert failures are logged only).
   */
  readonly usageMeteringEnabled: boolean;
  readonly bigQueryUsageEventsTableId: string;
};
