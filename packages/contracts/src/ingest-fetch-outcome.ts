import { z } from 'zod';

/**
 * Operational fetch / delta classification (WS4.2). Not persisted as SourceContent;
 * informs handoff to archive (WS4.3+). See docs/architecture/fetch-pipeline-v1.md.
 */

export const IngestFetchDeltaOutcomeSchema = z.enum([
  /** No prior `lastContentHash` on the source document. */
  'first_seen',
  'unchanged',
  'changed',
  'fetch_failed',
  'unsupported_or_skipped',
]);

export type IngestFetchDeltaOutcome = z.infer<typeof IngestFetchDeltaOutcomeSchema>;

/** One row per source per run-once iteration (ephemeral / logging / API response). */
export const IngestFetchRecordSchema = z.object({
  sourceId: z.string().uuid(),
  fetchedAt: z.string().datetime(),
  deltaOutcome: IngestFetchDeltaOutcomeSchema,
  httpStatusCode: z.number().int().nullable(),
  contentType: z.string().nullable(),
  etag: z.string().nullable(),
  lastModified: z.string().datetime().nullable(),
  /** Lowercase hex SHA-256 of normalized fingerprint input; null if no body hashed. */
  contentHash: z.string().nullable(),
  byteLength: z.number().int().nonnegative().nullable(),
  reasonCode: z.string().optional(),
  errorMessage: z.string().optional(),
});

export type IngestFetchRecord = z.infer<typeof IngestFetchRecordSchema>;

export const IngestRunOnceSummarySchema = z.object({
  processed: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  changed: z.number().int().nonnegative(),
  firstSeen: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  /** Sources for which raw + manifest were written to GCS (when persistence enabled). */
  archived: z.number().int().nonnegative(),
  /** Rows inserted into BigQuery `source_contents`. */
  persisted: z.number().int().nonnegative(),
  /** Qualifying deltas where persistence was skipped (config disabled or missing deps). */
  persistSkipped: z.number().int().nonnegative(),
  /** Qualifying deltas where persistence was attempted but failed. */
  persistFailed: z.number().int().nonnegative(),
  /** Pub/Sub handoff after successful GCS + BigQuery (when publishing enabled). */
  published: z.number().int().nonnegative(),
  /** Publish attempted but failed; persistence remains successful. */
  publishFailed: z.number().int().nonnegative(),
  /** Publishing disabled or not applicable after successful persistence. */
  publishSkipped: z.number().int().nonnegative(),
  /** Skipped before HTTP fetch: `checkFrequencyBucket` minimum interval not elapsed (WS10.4). */
  skippedRatePolicy: z.number().int().nonnegative(),
  /**
   * When listing all sources, at most this many were scheduled after the cap (null = single-source run or unlimited).
   */
  maxSourcesPerRunApplied: z.number().int().positive().nullable(),
  /** Sources not processed because `maxSourcesPerRun` truncated the list (full run only). */
  sourcesOmittedByCap: z.number().int().nonnegative(),
});

export type IngestRunOnceSummary = z.infer<typeof IngestRunOnceSummarySchema>;

export const IngestRunOnceResponseSchema = z.object({
  ok: z.literal(true),
  runAt: z.string().datetime(),
  summary: IngestRunOnceSummarySchema,
  /** Echo of optional scheduler/orchestration fields from the request body when present. */
  orchestrationEcho: z
    .object({
      correlationId: z.string().uuid().optional(),
      idempotencyKey: z.string().optional(),
      scheduledAt: z.string().datetime().optional(),
    })
    .optional(),
});

export type IngestRunOnceResponse = z.infer<typeof IngestRunOnceResponseSchema>;
