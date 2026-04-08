import { z } from 'zod';

/**
 * One row in a source-content manifest (relative keys from bucket root).
 */
export const ArchiveArtifactRefSchema = z.object({
  kind: z.enum(['raw', 'normalized', 'manifest']),
  relative_key: z.string().min(1),
  content_type: z.string().optional(),
  /** Optional SHA-256 of object bytes (64 lowercase hex). */
  sha256_hex: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});

export type ArchiveArtifactRef = z.infer<typeof ArchiveArtifactRefSchema>;

/**
 * Sidecar manifest linking a `source_content_id` to archived artifacts.
 */
export const ArchiveManifestSchema = z.object({
  schema_version: z.literal('gcs-archive-manifest-v1'),
  source_id: z.string().min(1),
  source_content_id: z.string().regex(/^[a-f0-9]{32}$/),
  observed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  artifacts: z.array(ArchiveArtifactRefSchema).min(1),
});

export type ArchiveManifest = z.infer<typeof ArchiveManifestSchema>;
