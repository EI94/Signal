import { z } from 'zod';
import { SignalSummaryV1Schema } from './api-serving-shared';

export const CountryStatusSchema = z.object({
  iso2: z.string().length(2),
  name: z.string(),
  signalCount: z.number().int().nonnegative(),
  status: z.enum(['red', 'yellow', 'green', 'neutral']),
  topSignalTitle: z.string().nullable(),
  topSignalScore: z.number().nullable(),
});

export type CountryStatus = z.infer<typeof CountryStatusSchema>;

export const PulseV1ResponseSchema = z.object({
  generatedAt: z.string(),
  windowHours: z.number(),
  totalSignals: z.number().int(),
  countries: z.array(CountryStatusSchema),
  topSignals: z.array(SignalSummaryV1Schema),
  allSignals: z.array(SignalSummaryV1Schema),
});

export type PulseV1Response = z.infer<typeof PulseV1ResponseSchema>;

export const PulseQueryV1Schema = z.object({
  windowHours: z.coerce.number().int().min(1).max(720).optional(),
  country: z.string().length(2).optional(),
});

export type PulseQueryV1 = z.infer<typeof PulseQueryV1Schema>;
