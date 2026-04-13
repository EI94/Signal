import { z } from 'zod';
import { WorkspaceRoleSchema } from './workspace-role';

export const HealthResponseSchema = z.object({
  service: z.string(),
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.string().datetime(),
  version: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export { type WorkspaceRole, WorkspaceRoleSchema } from './workspace-role';
export { normalizeMarketIndexTagIds } from './market-index-tags';

/** Active workspace summary returned when membership is resolved. */
export const WorkspaceContextSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
});

export type WorkspaceContext = z.infer<typeof WorkspaceContextSchema>;

const AuthMeUserSchema = z.object({
  uid: z.string(),
  email: z.string().nullable(),
  emailVerified: z.boolean(),
  displayName: z.string().nullable(),
  photoUrl: z.string().nullable(),
  signInProvider: z.string().nullable(),
  /** Auxiliary token claims only; not used for authorization in WS2. */
  customClaims: z.record(z.string(), z.unknown()),
});

/**
 * Authenticated user + Firestore-backed workspace membership (GET /v1/auth/me).
 * No user profile document; membership is the authz source of truth.
 */
export const AuthMeResponseSchema = z.object({
  user: AuthMeUserSchema,
  workspace: WorkspaceContextSchema,
  role: WorkspaceRoleSchema,
});

export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;

export {
  AGENT_DASHBOARD_ACTION_DESCRIPTORS,
  AGENT_DASHBOARD_ACTION_NAMES,
  type AgentDashboardActionDescriptor,
  AgentDashboardActionDescriptorSchema,
  type AgentDashboardActionErrorCode,
  AgentDashboardActionErrorCodeSchema,
  AgentDashboardActionExecuteFailureSchema,
  type AgentDashboardActionExecuteRequest,
  AgentDashboardActionExecuteRequestSchema,
  type AgentDashboardActionExecuteResponse,
  AgentDashboardActionExecuteResponseSchema,
  AgentDashboardActionExecuteSuccessSchema,
  type AgentDashboardActionLayerKind,
  AgentDashboardActionLayerKindSchema,
  type AgentDashboardActionName,
  AgentDashboardActionNameSchema,
  type AgentDashboardActionsListV1Response,
  AgentDashboardActionsListV1ResponseSchema,
  type AgentDashboardNextContext,
  AgentDashboardNextContextSchema,
  type ParsedAgentDashboardActionInput,
  parseAgentDashboardActionInput,
} from './agent-dashboard-actions';
export {
  httpStatusForToolExecutionResponse,
  mapInvokeErrorToExecutionStatus,
  type SignalToolExecutionError,
  SignalToolExecutionErrorSchema,
  type SignalToolExecutionRequest,
  SignalToolExecutionRequestSchema,
  type SignalToolExecutionResponse,
  SignalToolExecutionResponseSchema,
  type SignalToolExecutionStatus,
  SignalToolExecutionStatusSchema,
  type SignalToolExecutionUsage,
  SignalToolExecutionUsageSchema,
  type ToolOrchestrationMetering,
} from './agent-orchestrator';
export {
  type AlertCondition,
  AlertConditionSchema,
  type AlertEvaluationOutcome,
  AlertEvaluationOutcomeSchema,
  type AlertEvaluationRow,
  AlertEvaluationRowSchema,
  type BuildAlertEvaluationEventIdParams,
  buildAlertEvaluationEventId,
  type EvaluateAlertsRequest,
  EvaluateAlertsRequestSchema,
  type EvaluateAlertsResponse,
  EvaluateAlertsResponseSchema,
  type EvaluationRunId,
  EvaluationRunIdSchema,
} from './alert-rules-engine';
export {
  type AlertRuleSummaryV1,
  AlertRuleSummaryV1Schema,
  type AlertRulesListV1Response,
  AlertRulesListV1ResponseSchema,
} from './api-alerts';
export {
  type BoardSummaryV1Response,
  BoardSummaryV1ResponseSchema,
} from './api-board-summary';
export {
  type BriefDetailV1Response,
  BriefDetailV1ResponseSchema,
  type BriefMetadataV1,
  BriefMetadataV1Schema,
  type BriefsListV1Response,
  BriefsListV1ResponseSchema,
} from './api-briefs';
export {
  type EntityDetailQueryV1,
  EntityDetailQueryV1Schema,
  type EntityDetailTimelineQueryV1,
  EntityDetailTimelineQueryV1Schema,
  type EntityDetailV1Response,
  EntityDetailV1ResponseSchema,
  type EntityPathParamsV1,
  EntityPathParamsV1Schema,
} from './api-entities';
export {
  type ApiErrorEnvelopeV1,
  ApiErrorEnvelopeV1Schema,
} from './api-error-envelope';
export {
  type InternalSourceSummaryV1,
  InternalSourceSummaryV1Schema,
  type InternalSourcesListV1Response,
  InternalSourcesListV1ResponseSchema,
  type InternalToolExecutionRequestV1,
  InternalToolExecutionRequestV1Schema,
  type InternalTriggerSourceFetchV1Body,
  InternalTriggerSourceFetchV1BodySchema,
} from './api-internal-v1';
export {
  type MapSignalPointV1,
  MapSignalPointV1Schema,
  type MapSignalsQueryV1,
  MapSignalsQueryV1Schema,
  type MapSignalsV1Response,
  MapSignalsV1ResponseSchema,
} from './api-map';
export {
  type MarketCard,
  MarketCardSchema,
  type MarketStripV1Response,
  MarketStripV1ResponseSchema,
} from './api-market';
export {
  isBroadcastNotificationItem,
  type NotificationItemV1,
  NotificationItemV1Schema,
  type NotificationPatchBodyV1,
  NotificationPatchBodyV1Schema,
  type NotificationPatchV1Response,
  NotificationPatchV1ResponseSchema,
  type NotificationPathParamsV1,
  NotificationPathParamsV1Schema,
  type NotificationsListQueryV1,
  NotificationsListQueryV1Schema,
  type NotificationsListV1Response,
  NotificationsListV1ResponseSchema,
} from './api-notifications';
export {
  type AlertingPreferences,
  AlertingPreferencesSchema,
  type CadenceMode,
  CadenceModeSchema,
  type ChannelPreferences,
  ChannelPreferencesSchema,
  type DigestPreferences,
  DigestPreferencesSchema,
  type FullPreferencesPayload,
  FullPreferencesPayloadSchema,
  type GetPreferencesResponse,
  GetPreferencesResponseSchema,
  type MemberPreferencesDocument,
  MemberPreferencesDocumentSchema,
  type NotificationPreferences,
  NotificationPreferencesSchema,
  type SavePreferencesRequest,
  SavePreferencesRequestSchema,
  type SavePreferencesResponse,
  SavePreferencesResponseSchema,
  type TestDeliveryCTAResponse,
  TestDeliveryCTAResponseSchema,
  type GeographicAlertScope,
  GeographicAlertScopeSchema,
  type MacroRegionCode,
  MacroRegionCodeSchema,
} from './api-preferences';
export {
  type CatalogSourceRowV1,
  CatalogSourceRowV1Schema,
  type CatalogSourcesV1Response,
  CatalogSourcesV1ResponseSchema,
  type CreateSourceDraftRequest,
  CreateSourceDraftRequestSchema,
  type CreateSourceDraftResponse,
  CreateSourceDraftResponseSchema,
  SOURCE_DRAFTS_SUBCOLLECTION,
  type SuggestedInstitutionalSource,
  SuggestedInstitutionalSourceSchema,
  type SuggestEntitySourcesRequest,
  SuggestEntitySourcesRequestSchema,
  type SuggestEntitySourcesResponse,
  SuggestEntitySourcesResponseSchema,
} from './api-monitoring-v1';
export {
  type CountryStatus,
  CountryStatusSchema,
  type PulseQueryV1,
  PulseQueryV1Schema,
  type PulseV1Response,
  PulseV1ResponseSchema,
} from './api-pulse';
export {
  type SearchQueryV1,
  SearchQueryV1Schema,
  type SearchResultItem,
  type SearchV1Response,
  SearchV1ResponseSchema,
} from './api-search';
export {
  type CursorPaginationQueryV1,
  CursorPaginationQueryV1Schema,
  IsoDateTimeStringSchema,
  type SignalSummaryV1,
  SignalSummaryV1Schema,
  type WorkspaceScopeQueryV1,
  WorkspaceScopeQueryV1Schema,
} from './api-serving-shared';
export {
  type FacetBucketV1,
  FacetBucketV1Schema,
  type SignalsFeedFacetsV1,
  SignalsFeedFacetsV1Schema,
  type SignalsFeedFiltersV1,
  SignalsFeedFiltersV1Schema,
  type SignalsFeedGetInput,
  SignalsFeedGetInputSchema,
  type SignalsFeedQueryV1,
  SignalsFeedQueryV1Schema,
  type SignalsFeedV1Response,
  SignalsFeedV1ResponseSchema,
} from './api-signals';
export {
  type CreateWatchlistRequest,
  CreateWatchlistRequestSchema,
  type DeleteWatchlistResponse,
  DeleteWatchlistResponseSchema,
  type UpdateWatchlistRequest,
  UpdateWatchlistRequestSchema,
  type WatchlistDetailV1,
  type WatchlistDetailV1Response,
  WatchlistDetailV1ResponseSchema,
  WatchlistDetailV1Schema,
  type WatchlistPathParams,
  WatchlistPathParamsSchema,
  type WatchlistSummaryV1,
  WatchlistSummaryV1Schema,
  type WatchlistsListV1Response,
  WatchlistsListV1ResponseSchema,
} from './api-watchlists';
export {
  type EntitySignalLinkRow,
  EntitySignalLinkRowSchema,
  type SignalScoreSnapshot,
  SignalScoreSnapshotSchema,
} from './bigquery-analytical';
export {
  type SendAlertEmailRequest,
  SendAlertEmailRequestSchema,
  type SendBriefEmailRequest,
  SendBriefEmailRequestSchema,
  type SendEmailDeliveryResponse,
  SendEmailDeliveryResponseSchema,
} from './email-delivery';
export {
  type ExtractedEventFamilyMvp,
  ExtractedEventFamilyMvpSchema,
  type ExtractedEventRow,
  ExtractedEventRowSchema,
  type ExtractSourceContentRequest,
  ExtractSourceContentRequestSchema,
} from './extracted-event';
export { buildMatchSignature, deriveExtractedEventId } from './extracted-event-id';
export {
  type AlertRuleDocument,
  AlertRuleDocumentSchema,
  type BriefDocument,
  BriefDocumentSchema,
  BUSINESS_ENTITY_SEEDS_COLLECTION,
  type BusinessEntitySeedDocument,
  BusinessEntitySeedDocumentSchema,
  type EmailDeliveryDocument,
  EmailDeliveryDocumentSchema,
  type EmailDeliveryKind,
  EmailDeliveryKindSchema,
  type EmailDeliveryStatus,
  EmailDeliveryStatusSchema,
  type EntityRef,
  EntityRefSchema,
  type FeatureFlagDocument,
  FeatureFlagDocumentSchema,
  type LatestSignalDocument,
  LatestSignalDocumentSchema,
  type NotificationDocument,
  NotificationDocumentSchema,
  type NotificationStatus,
  NotificationStatusSchema,
  type SavedViewDocument,
  SavedViewDocumentSchema,
  type WatchlistDocument,
  WatchlistDocumentSchema,
  type WorkspaceMemberDocument,
  WorkspaceMemberDocumentSchema,
  type WorkspaceRootDocument,
  WorkspaceRootDocumentSchema,
} from './firestore-operational';
export {
  type ArchiveArtifactRef,
  ArchiveArtifactRefSchema,
  type ArchiveManifest,
  ArchiveManifestSchema,
} from './gcs-archive-manifest';
export {
  buildGsUri,
  buildManifestObjectKey,
  buildNormalizedTextObjectKey,
  buildRawSourceObjectKey,
  type RawArchiveExtension,
} from './gcs-archive-paths';
export {
  type GeographyMeta,
  getAllCountryIso2Codes,
  getCountryNameByIso2,
  inferCountryCodesFromText,
  isCountryGeography,
  lookupGeographyMeta,
} from './geography-iso';
export {
  type HealthSummaryV1,
  HealthSummaryV1Schema,
} from './health-slo';
export {
  type IngestFetchDeltaOutcome,
  IngestFetchDeltaOutcomeSchema,
  type IngestFetchRecord,
  IngestFetchRecordSchema,
  type IngestRunOnceResponse,
  IngestRunOnceResponseSchema,
  type IngestRunOnceSummary,
  IngestRunOnceSummarySchema,
} from './ingest-fetch-outcome';
export {
  type IngestInternalRunOnceBodyV1,
  IngestInternalRunOnceBodyV1Schema,
} from './ingest-internal-run-once';
export {
  EvaluateAlertsToolInputSchema,
  type ExtractEventsToolInput,
  ExtractEventsToolInputSchema,
  type ExtractEventsToolOutput,
  ExtractEventsToolOutputSchema,
  type FetchSourceToolInput,
  FetchSourceToolInputSchema,
  type FetchSourceToolOutput,
  FetchSourceToolOutputSchema,
  GenerateBriefToolInputSchema,
  type InternalToolDeclaration,
  InternalToolDeclarationSchema,
  type InternalToolDescriptor,
  InternalToolDescriptorSchema,
  type InternalToolSuccessOutput,
  type NotImplementedToolOutput,
  NotImplementedToolOutputSchema,
  type ScoreSignalToolInput,
  ScoreSignalToolInputSchema,
  type ScoreSignalToolOutput,
  ScoreSignalToolOutputSchema,
  SIGNAL_INTERNAL_TOOL_NAMES,
  type SignalInternalToolInvokeRequest,
  SignalInternalToolInvokeRequestSchema,
  type SignalInternalToolInvokeResult,
  SignalInternalToolInvokeResultSchema,
  type SignalInternalToolName,
  SignalInternalToolNameSchema,
  type SummarizeDeltaProviderResult,
  SummarizeDeltaProviderResultSchema,
  type SummarizeDeltaToolInput,
  SummarizeDeltaToolInputSchema,
  type SummarizeDeltaToolOutput,
  SummarizeDeltaToolOutputSchema,
  safeParseInternalToolSuccessOutput,
} from './internal-tools';
export {
  listMcpReadyCapabilities,
  type McpReadyAvailability,
  McpReadyAvailabilitySchema,
  type McpReadyCapabilitiesListV1Response,
  McpReadyCapabilitiesListV1ResponseSchema,
  type McpReadyCapabilityV1,
  McpReadyCapabilityV1Schema,
  type McpReadySchemaProjection,
  McpReadySchemaProjectionSchema,
} from './mcp-ready';
export {
  type BriefRunRow,
  BriefRunRowSchema,
  type GenerateMorningBriefRequest,
  GenerateMorningBriefRequestSchema,
  type MorningBriefGenerationResult,
  MorningBriefGenerationResultSchema,
  type MorningBriefType,
  MorningBriefTypeSchema,
} from './morning-brief';
export {
  ORCHESTRATION_STEP,
  type OrchestrationContextV1,
  OrchestrationContextV1Schema,
  type OrchestrationStepId,
} from './orchestration-context';
export {
  buildOrchestrationIdempotencyKey,
  buildScheduledIngestRunIdempotencyKey,
  buildSourceContentHandoffIdempotencyKey,
  ORCHESTRATION_KEY_VERSION,
} from './orchestration-idempotency';
export {
  type ParsedHandoffMeta,
  type PipelineHandoffEnvelopeV1,
  PipelineHandoffEnvelopeV1Schema,
  parseSourceContentPersistedForIntel,
} from './pipeline-handoff-envelope';
export {
  type PromoteSourceContentSignalsRequest,
  PromoteSourceContentSignalsRequestSchema,
  SIGNAL_PROMOTION_SCORING_VERSION,
  type SignalNovelty,
  SignalNoveltySchema,
  type SignalRow,
  SignalRowSchema,
  type SignalStatus,
  SignalStatusSchema,
} from './signal';
export { deriveSignalId } from './signal-id';
export { computeSignalStoryKey } from './signal-story-key';
export {
  type SourceContentExtractionStatus,
  SourceContentExtractionStatusSchema,
} from './source-content-extraction';
export { deriveSourceContentId } from './source-content-id';
export {
  type BuildSourceContentPersistedEventV1Params,
  buildSourceContentPersistedEventV1,
  type SourceContentPersistedEvent,
  SourceContentPersistedEventSchema,
} from './source-content-persisted-event';
export {
  type CheckFrequencyBucket,
  CheckFrequencyBucketSchema,
  type EtagSupport,
  EtagSupportSchema,
  type ExpectedContentKind,
  ExpectedContentKindSchema,
  type FetchMethodHint,
  FetchMethodHintSchema,
  SOURCE_REGISTRY_COLLECTION,
  type SourceCategory,
  SourceCategorySchema,
  type SourceFetchStrategy,
  SourceFetchStrategySchema,
  type SourceIngestState,
  SourceIngestStateSchema,
  type SourceParserStrategy,
  type SourceParserStrategyKey,
  SourceParserStrategyKeySchema,
  SourceParserStrategySchema,
  type SourcePriorityTier,
  SourcePriorityTierSchema,
  type SourceRegistryDocument,
  SourceRegistryDocumentSchema,
  type SourceType,
  SourceTypeSchema,
} from './source-registry';
export {
  type AlertsEvaluateExposureInput,
  AlertsEvaluateExposureInputSchema,
  type AlertsSendEmailExposureInput,
  AlertsSendEmailExposureInputSchema,
  type BoardSummaryGetInput,
  BoardSummaryGetInputSchema,
  type BriefGenerateExposureInput,
  BriefGenerateExposureInputSchema,
  type BriefSendEmailExposureInput,
  BriefSendEmailExposureInputSchema,
  type EntityContextGetInput,
  EntityContextGetInputSchema,
  EXPOSED_TOOL_DESCRIPTORS,
  EXPOSED_TOOL_NAMES,
  type ExposedToolDescriptor,
  ExposedToolDescriptorSchema,
  type ExposedToolKind,
  ExposedToolKindSchema,
  type ExposedToolName,
  ExposedToolNameSchema,
  type MapSignalsGetInput,
  MapSignalsGetInputSchema,
  type ParsedExposedToolInput,
  parseExposedToolInput,
  type SourceFetchExposureInput,
  SourceFetchExposureInputSchema,
  type ToolExposureErrorCode,
  ToolExposureErrorCodeSchema,
  ToolExposureErrorResponseSchema,
  type ToolExposureExecuteRequest,
  ToolExposureExecuteRequestSchema,
  type ToolExposureExecuteResponse,
  ToolExposureExecuteResponseSchema,
  ToolExposureSuccessResponseSchema,
  type ToolsExposureListV1Response,
  ToolsExposureListV1ResponseSchema,
} from './tool-exposure';
export {
  type UsageMeteringEventType,
  UsageMeteringEventTypeSchema,
  type UsageMeteringOutcome,
  UsageMeteringOutcomeSchema,
  type UsageMeteringRow,
  UsageMeteringRowSchema,
  type UsageMeteringServiceName,
  UsageMeteringServiceNameSchema,
  type UsageMeteringUnit,
  UsageMeteringUnitSchema,
} from './usage-metering';
