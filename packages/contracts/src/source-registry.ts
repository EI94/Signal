import { z } from 'zod';
import { EntityRefSchema } from './firestore-operational';

/**
 * Global source registry (`sources/{sourceId}`): what to fetch and how to interpret it.
 * Not SourceContent (fetched bytes), not signals. See docs/architecture/source-registry-v1.md.
 */

/** Firestore top-level collection name for the global registry. */
export const SOURCE_REGISTRY_COLLECTION = 'sources' as const;

export const SourceTypeSchema = z.enum([
  'web_page',
  'rss_feed',
  'pdf_endpoint',
  'json_api',
  'regulatory_feed',
]);

export type SourceType = z.infer<typeof SourceTypeSchema>;

/** Domain / subject classification for filtering and routing (MVP set). */
export const SourceCategorySchema = z.enum([
  'competitor',
  'client',
  'commodity',
  'policy_regulatory',
  'technology',
  'corporate_reporting',
  'project_pipeline',
  'general_market',
  'other',
]);

export type SourceCategory = z.infer<typeof SourceCategorySchema>;

/** Scheduling importance (ingest ordering / future scheduler). */
export const SourcePriorityTierSchema = z.enum(['p0_critical', 'p1_high', 'p2_standard', 'p3_low']);

export type SourcePriorityTier = z.infer<typeof SourcePriorityTierSchema>;

/** How often the source should be checked (bucket, not a cron parser yet). */
export const CheckFrequencyBucketSchema = z.enum(['hourly', 'every_6h', 'daily', 'weekly']);

export type CheckFrequencyBucket = z.infer<typeof CheckFrequencyBucketSchema>;

/** Aligns HTTP/fetch layer with source type (WS4.2). */
export const FetchMethodHintSchema = z.enum(['html', 'rss', 'pdf', 'json']);

export type FetchMethodHint = z.infer<typeof FetchMethodHintSchema>;

/** Whether conditional requests are expected to work (WS4.2). */
export const EtagSupportSchema = z.enum(['unknown', 'expected', 'none']);

export type EtagSupport = z.infer<typeof EtagSupportSchema>;

export const SourceFetchStrategySchema = z.object({
  fetchMethodHint: FetchMethodHintSchema,
  checkFrequencyBucket: CheckFrequencyBucketSchema,
  /** Optional: longer timeouts / more retries for slow endpoints (WS4.2). */
  timeoutRetryClass: z.enum(['standard', 'extended']).optional(),
  etagSupport: EtagSupportSchema,
  /** MVP default: public sources without credentials. */
  authRequired: z.boolean(),
});

export type SourceFetchStrategy = z.infer<typeof SourceFetchStrategySchema>;

export const SourceParserStrategyKeySchema = z.enum([
  'html_generic',
  'rss_generic',
  'pdf_generic',
  'json_generic',
  'regulatory_filing_generic',
]);

export type SourceParserStrategyKey = z.infer<typeof SourceParserStrategyKeySchema>;

export const ExpectedContentKindSchema = z.enum([
  'web_html',
  'rss_xml',
  'pdf_binary',
  'json_payload',
  'regulatory_html',
  'unknown',
]);

export type ExpectedContentKind = z.infer<typeof ExpectedContentKindSchema>;

export const SourceParserStrategySchema = z.object({
  parserStrategyKey: SourceParserStrategyKeySchema,
  /** ISO 639-1 when known (e.g. `it`, `en`). */
  contentLanguageHint: z.string().length(2).optional(),
  expectedContentKind: ExpectedContentKindSchema.optional(),
});

export type SourceParserStrategy = z.infer<typeof SourceParserStrategySchema>;

/** Ingest-maintained operational fields (optional until WS4.2+). */
export const SourceIngestStateSchema = z.object({
  lastFetchedAt: z.coerce.date().optional(),
  lastContentHash: z.string().optional(),
  /** Last raw archive URI for this source’s latest snapshot (align naming with BigQuery / GCS docs). */
  lastArchivedGcsUri: z.string().optional(),
  fetchStatus: z.enum(['healthy', 'degraded', 'failing', 'disabled']).optional(),
  consecutiveFailures: z.number().int().nonnegative().optional(),
});

export type SourceIngestState = z.infer<typeof SourceIngestStateSchema>;

/**
 * Full document shape for `sources/{sourceId}`.
 * Document ID must equal `sourceId`.
 */
export const SourceRegistryDocumentSchema = SourceIngestStateSchema.extend({
  sourceId: z.string().uuid(),
  name: z.string().min(1),
  /** Canonical fetch URL or API endpoint (no tracking params where avoidable). */
  canonicalUrl: z.string().min(1),
  sourceType: SourceTypeSchema,
  category: SourceCategorySchema,
  isActive: z.boolean(),
  /** 0–100; aligns with “source authority” in ontology; feeds downstream scoring. */
  authorityScore: z.number().int().min(0).max(100),
  priorityTier: SourcePriorityTierSchema,
  /** Last human/admin review of source definition (not fetch time). */
  lastReviewedAt: z.coerce.date().optional(),
  fetchStrategy: SourceFetchStrategySchema,
  parserStrategy: SourceParserStrategySchema,
  linkedEntityRefs: z.array(EntityRefSchema),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  createdBy: z.string().min(1).optional(),
  notes: z.string().max(500).optional(),
});

export type SourceRegistryDocument = z.infer<typeof SourceRegistryDocumentSchema>;
