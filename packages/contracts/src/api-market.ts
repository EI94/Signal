import { z } from 'zod';

export const MarketCardSchema = z.object({
  symbol: z.string(),
  label: z.string(),
  value: z.number().nullable(),
  previousClose: z.number().nullable(),
  delta: z.string().nullable(),
  direction: z.enum(['up', 'down', 'flat']).nullable(),
  currency: z.string().nullable(),
  updatedAt: z.string().nullable(),
  stale: z.boolean(),
});

export type MarketCard = z.infer<typeof MarketCardSchema>;

export const MarketStripV1ResponseSchema = z.object({
  generatedAt: z.string(),
  ttlSeconds: z.number().int(),
  cards: z.array(MarketCardSchema),
});

export type MarketStripV1Response = z.infer<typeof MarketStripV1ResponseSchema>;
