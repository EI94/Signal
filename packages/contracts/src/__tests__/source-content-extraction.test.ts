import { describe, expect, it } from 'vitest';
import { SourceContentExtractionStatusSchema } from '../source-content-extraction';

describe('SourceContentExtractionStatusSchema', () => {
  it('accepts known statuses', () => {
    for (const status of [
      'pending',
      'normalized_ready',
      'normalization_skipped',
      'normalization_failed',
      'awaiting_pdf_text_extraction',
      'extracted_ready',
      'no_events_detected',
      'extraction_failed',
      'promoted_ready',
      'promotion_failed',
    ] as const) {
      expect(SourceContentExtractionStatusSchema.safeParse(status).success).toBe(true);
    }
    expect(SourceContentExtractionStatusSchema.safeParse('invalid').success).toBe(false);
  });
});
