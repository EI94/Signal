import { z } from 'zod';

/**
 * Analytical `source_contents.extraction_status` values after intel intake (WS5 bridge).
 * Keep small; extraction semantics evolve in later epics.
 */
export const SourceContentExtractionStatusSchema = z.enum([
  /** Ingest wrote the row; intel has not completed intake yet. */
  'pending',
  /** Normalized `.txt` written under `normalized/` in GCS; ready for later extractors. */
  'normalized_ready',
  /** Nothing to normalize or writes disabled; not an error. */
  'normalization_skipped',
  /** Intel attempted normalization but failed (see `extraction_error_code`). */
  'normalization_failed',
  /** PDF bytes present; text extraction deferred to a future epic. */
  'awaiting_pdf_text_extraction',
  /** At least one ExtractedEvent written for this SourceContent. */
  'extracted_ready',
  /** Deterministic extraction threw or BigQuery insert failed after cleanup attempt. */
  'extraction_failed',
  /** Normalized text processed; no MVP heuristic matched. */
  'no_events_detected',
  /** Deterministic promotion produced Signals (possibly zero if nothing qualified). */
  'promoted_ready',
  /** Promotion/scoring persistence failed (see `extraction_error_code`). */
  'promotion_failed',
]);

export type SourceContentExtractionStatus = z.infer<typeof SourceContentExtractionStatusSchema>;
