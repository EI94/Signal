import { z } from 'zod';

/**
 * GET `/v1/briefs`, GET `/v1/briefs/:briefId` — metadata only (no generated body).
 * Aligns with Firestore `BriefDocument` fields, ISO strings for wire format.
 */
export const BriefMetadataV1Schema = z.object({
  briefId: z.string().min(1),
  briefType: z.string().min(1),
  title: z.string().min(1).max(500).optional(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  status: z.string().min(1),
  summaryRef: z.string().optional(),
  updatedAt: z.string().datetime(),
});

export type BriefMetadataV1 = z.infer<typeof BriefMetadataV1Schema>;

export const BriefsListV1ResponseSchema = z.object({
  workspaceId: z.string().min(1),
  items: z.array(BriefMetadataV1Schema).max(100),
  nextPageToken: z.string().nullable().optional(),
});

export type BriefsListV1Response = z.infer<typeof BriefsListV1ResponseSchema>;

export const BriefDetailV1ResponseSchema = BriefMetadataV1Schema;

export type BriefDetailV1Response = z.infer<typeof BriefDetailV1ResponseSchema>;
