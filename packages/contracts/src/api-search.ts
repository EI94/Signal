import { z } from 'zod';
import { SignalSummaryV1Schema } from './api-serving-shared';

export const SearchQueryV1Schema = z.object({
  q: z.string().min(2).max(200),
  windowHours: z.coerce.number().int().min(1).max(720).optional(),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

export type SearchQueryV1 = z.infer<typeof SearchQueryV1Schema>;

const SearchResultItemSchema = z.object({
  type: z.enum(['signal', 'country', 'entity']),
  label: z.string(),
  sublabel: z.string().nullable().optional(),
  signal: SignalSummaryV1Schema.nullable().optional(),
  iso2: z.string().nullable().optional(),
  entityType: z.string().nullable().optional(),
  entityId: z.string().nullable().optional(),
});

export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const SearchV1ResponseSchema = z.object({
  query: z.string(),
  results: z.array(SearchResultItemSchema),
  totalMatches: z.number().int(),
  scope: z.enum(['live_window', 'token_index']),
  windowCapped: z.boolean(),
});

export type SearchV1Response = z.infer<typeof SearchV1ResponseSchema>;
