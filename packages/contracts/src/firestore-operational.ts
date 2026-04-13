import { z } from 'zod';
import { WorkspaceRoleSchema } from './workspace-role';

/**
 * Operational Firestore models (workspace-scoped serving layer).
 * Not canonical analytics history; not raw source payloads.
 */

/** Minimal cross-document entity pointer (no embedded ontology graph). */
export const EntityRefSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  displayName: z.string().optional(),
});

export type EntityRef = z.infer<typeof EntityRefSchema>;

/** `workspaces/{workspaceId}` root document. Timestamps optional for lenient reads of hand-seeded docs. */
export const WorkspaceRootDocumentSchema = z.object({
  name: z.string().min(1),
  slug: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type WorkspaceRootDocument = z.infer<typeof WorkspaceRootDocumentSchema>;

/** `workspaces/{workspaceId}/members/{uid}` */
export const WorkspaceMemberDocumentSchema = z.object({
  uid: z.string().min(1),
  role: WorkspaceRoleSchema,
  isActive: z.boolean(),
  joinedAt: z.date().optional(),
  updatedAt: z.date().optional(),
  email: z.string().optional(),
  displayName: z.string().optional(),
});

export type WorkspaceMemberDocument = z.infer<typeof WorkspaceMemberDocumentSchema>;

/**
 * Hand-seeded business truth (e.g. MAIRE CSV import). Not inferred from signals.
 * Path: `workspaces/{workspaceId}/businessEntitySeeds/{entityId}` — document id equals `entityId`.
 */
export const BUSINESS_ENTITY_SEEDS_COLLECTION = 'businessEntitySeeds' as const;

export const BusinessEntitySeedDocumentSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  canonicalName: z.string().min(1),
  aliases: z.array(z.string()),
  category: z.string().optional(),
  priority: z.string().optional(),
  notes: z.string().optional(),
  /** Importer provenance label for audits. */
  seedLabel: z.string().min(1),
  iso2: z.string().length(2).optional(),
  iso3: z.string().length(3).optional(),
  geographyKind: z.enum(['country', 'region', 'subregion']).optional(),
  regionGroup: z.string().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type BusinessEntitySeedDocument = z.infer<typeof BusinessEntitySeedDocumentSchema>;

/** `workspaces/{workspaceId}/watchlists/{watchlistId}` */
export const WatchlistDocumentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  entityRefs: z.array(EntityRefSchema),
  isDefault: z.boolean().optional(),
  createdBy: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type WatchlistDocument = z.infer<typeof WatchlistDocumentSchema>;

/** `workspaces/{workspaceId}/savedViews/{savedViewId}` */
export const SavedViewDocumentSchema = z.object({
  name: z.string().min(1),
  viewType: z.string().min(1),
  filters: z.record(z.string(), z.unknown()),
  sort: z.record(z.string(), z.unknown()).optional(),
  createdBy: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SavedViewDocument = z.infer<typeof SavedViewDocumentSchema>;

const ProvenanceSummarySchema = z.object({
  /** Global `sources/{sourceId}` registry id when promoted from SourceContent. */
  sourceId: z.string().uuid().optional(),
  sourceLabel: z.string().optional(),
  sourceUrl: z.string().optional(),
  contentRef: z.string().optional(),
  sourcePublishedAt: z.coerce.date().optional(),
  sourceLinkedGeoCodes: z.array(z.string()).optional(),
});

/** `workspaces/{workspaceId}/signalsLatest/{signalId}` — operational latest snapshot only. */
export const LatestSignalDocumentSchema = z.object({
  signalId: z.string().min(1),
  signalType: z.string().min(1),
  title: z.string().min(1),
  shortSummary: z.string().nullish(),
  entityRefs: z.array(EntityRefSchema),
  score: z.number(),
  status: z.string().min(1),
  novelty: z.string().nullish(),
  occurredAt: z.date(),
  detectedAt: z.date(),
  provenance: ProvenanceSummarySchema.optional(),
  updatedAt: z.date(),
  /** Lowercase word tokens from title + entity names for Firestore array-contains search. */
  searchTokens: z.array(z.string()).optional(),
  /**
   * Stable story fingerprint (`computeSignalStoryKey`) for deduplicating alerts/digests when the
   * pipeline emits a new `signalId` for the same underlying item (new extraction / source).
   */
  storyKey: z.string().min(1).optional(),
  /**
   * Market / equity index tags (e.g. entity ids from `market_index` refs) for feed filtering
   * against `AlertingPreferences.watchedIndexIds`.
   */
  marketIndexTagIds: z.array(z.string().min(1)).max(32).optional(),
});

export type LatestSignalDocument = z.infer<typeof LatestSignalDocumentSchema>;

export const NotificationStatusSchema = z.enum(['unread', 'read', 'dismissed']);

export type NotificationStatus = z.infer<typeof NotificationStatusSchema>;

/** `workspaces/{workspaceId}/notifications/{notificationId}` */
export const NotificationDocumentSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  message: z.string().optional(),
  signalId: z.string().optional(),
  status: NotificationStatusSchema,
  /** Target user; omit only if the doc is explicitly workspace-broadcast (avoid by default). */
  userId: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type NotificationDocument = z.infer<typeof NotificationDocumentSchema>;

/** `workspaces/{workspaceId}/featureFlags/{flagKey}` — document id = flagKey. */
export const FeatureFlagDocumentSchema = z.object({
  enabled: z.boolean(),
  payload: z.record(z.string(), z.unknown()).optional(),
  updatedAt: z.date(),
});

export type FeatureFlagDocument = z.infer<typeof FeatureFlagDocumentSchema>;

/** `workspaces/{workspaceId}/briefs/{briefId}` — metadata; full body at `summaryRef` (e.g. GCS) when present. */
export const BriefDocumentSchema = z.object({
  briefType: z.string().min(1),
  /** Optional display title for listings (e.g. morning brief heading). */
  title: z.string().min(1).max(500).optional(),
  periodStart: z.date(),
  periodEnd: z.date(),
  status: z.string().min(1),
  summaryRef: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type BriefDocument = z.infer<typeof BriefDocumentSchema>;

/** `workspaces/{workspaceId}/alertRules/{ruleId}` — structure only; no evaluator. */
export const AlertRuleDocumentSchema = z.object({
  name: z.string().min(1),
  isActive: z.boolean(),
  scope: z.record(z.string(), z.unknown()),
  conditions: z.record(z.string(), z.unknown()),
  cooldownMinutes: z.number().int().nonnegative(),
  createdBy: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type AlertRuleDocument = z.infer<typeof AlertRuleDocumentSchema>;

/** `workspaces/{workspaceId}/emailDeliveries/{deliveryId}` — operational send audit (not a marketing event bus). */
export const EmailDeliveryKindSchema = z.enum(['brief', 'alert']);

export type EmailDeliveryKind = z.infer<typeof EmailDeliveryKindSchema>;

export const EmailDeliveryStatusSchema = z.enum(['sent', 'failed']);

export type EmailDeliveryStatus = z.infer<typeof EmailDeliveryStatusSchema>;

export const EmailDeliveryDocumentSchema = z.object({
  kind: EmailDeliveryKindSchema,
  status: EmailDeliveryStatusSchema,
  provider: z.literal('resend'),
  subject: z.string().min(1),
  /** Same cardinality as the Resend `to` list; no raw recipient list persisted. */
  recipientCount: z.number().int().nonnegative(),
  /** Unique recipient domains (lowercase), for operational triage without full addresses. */
  recipientDomains: z.array(z.string().min(1)),
  /** First-character masked form (e.g. `a***@example.com`), capped for doc size. */
  recipientsMasked: z.array(z.string().min(1)).max(32).optional(),
  attemptedAt: z.date(),
  sentAt: z.date().optional(),
  providerMessageId: z.string().optional(),
  errorMessage: z.string().optional(),
  briefId: z.string().optional(),
  alertRuleId: z.string().optional(),
  signalId: z.string().optional(),
  evaluationReference: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type EmailDeliveryDocument = z.infer<typeof EmailDeliveryDocumentSchema>;
