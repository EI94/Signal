import { z } from 'zod';

/** Row for GET `/v1/catalog/sources` — subset of `SourceRegistryDocument`. */
export const CatalogSourceRowV1Schema = z.object({
  sourceId: z.string().uuid(),
  name: z.string().min(1),
  canonicalUrl: z.string().min(1),
  category: z.string().min(1),
  authorityScore: z.number().int().min(0).max(100),
});

export type CatalogSourceRowV1 = z.infer<typeof CatalogSourceRowV1Schema>;

export const CatalogSourcesV1ResponseSchema = z.object({
  sources: z.array(CatalogSourceRowV1Schema),
});

export type CatalogSourcesV1Response = z.infer<typeof CatalogSourcesV1ResponseSchema>;

export const SuggestEntitySourcesRequestSchema = z.object({
  entityQuery: z.string().min(2).max(240),
  entityTypeHint: z.enum(['organization', 'commodity', 'geography', 'unknown']).optional(),
});

export type SuggestEntitySourcesRequest = z.infer<typeof SuggestEntitySourcesRequestSchema>;

export const SuggestedInstitutionalSourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  kind: z.enum([
    'issuer_investor_relations',
    'regulator',
    'statistics_office',
    'stock_exchange',
    'official_company',
    'other',
  ]),
  credibilityNote: z.string().min(1),
});

export type SuggestedInstitutionalSource = z.infer<typeof SuggestedInstitutionalSourceSchema>;

export const SuggestEntitySourcesResponseSchema = z.object({
  suggestions: z.array(SuggestedInstitutionalSourceSchema).max(12),
});

export type SuggestEntitySourcesResponse = z.infer<typeof SuggestEntitySourcesResponseSchema>;

/** `workspaces/{workspaceId}/sourceDrafts/{draftId}` — operator review before registry insert. */
export const SOURCE_DRAFTS_SUBCOLLECTION = 'sourceDrafts' as const;

export const CreateSourceDraftRequestSchema = z.object({
  proposedName: z.string().min(1).max(200),
  proposedUrl: z.string().url().max(2048),
  category: z.string().max(64).optional(),
  rationale: z.string().max(2000).optional(),
  /** True when created from the Gemini suggestion list (audit only). */
  fromGeminiSuggestion: z.boolean().optional(),
});

export type CreateSourceDraftRequest = z.infer<typeof CreateSourceDraftRequestSchema>;

export const CreateSourceDraftResponseSchema = z.object({
  draftId: z.string().min(1),
  status: z.literal('pending_review'),
});

export type CreateSourceDraftResponse = z.infer<typeof CreateSourceDraftResponseSchema>;
