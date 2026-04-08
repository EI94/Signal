import { z } from 'zod';
import { SignalSummaryV1Schema } from './api-serving-shared';

/**
 * GET `/v1/board/summary` — executive / home surface (read model WS6.2).
 */
export const BoardSummaryV1ResponseSchema = z.object({
  workspaceId: z.string().min(1),
  generatedAt: z.string().datetime(),
  /** Snapshot timestamp for aggregated numbers / ordering. */
  asOf: z.string().datetime(),
  topSignals: z.array(SignalSummaryV1Schema).max(20),
  /**
   * Optional narrative blocks when the read model has pre-aggregated copy.
   * Omitted when not yet computed — not placeholder text.
   */
  highlights: z
    .object({
      competitorMoves: z.string().max(16_000).optional(),
      clientChanges: z.string().max(16_000).optional(),
      commoditySnapshot: z.string().max(16_000).optional(),
    })
    .optional(),
});

export type BoardSummaryV1Response = z.infer<typeof BoardSummaryV1ResponseSchema>;
