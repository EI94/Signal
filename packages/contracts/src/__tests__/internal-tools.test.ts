import { describe, expect, it } from 'vitest';
import {
  FetchSourceToolInputSchema,
  FetchSourceToolOutputSchema,
  SignalInternalToolInvokeResultSchema,
  SignalInternalToolNameSchema,
  SummarizeDeltaToolOutputSchema,
} from '../internal-tools';

describe('internal-tools contracts', () => {
  it('parses tool names strictly', () => {
    expect(SignalInternalToolNameSchema.parse('fetch_source')).toBe('fetch_source');
    expect(() => SignalInternalToolNameSchema.parse('unknown')).toThrow();
  });

  it('validates fetch_source input (uuid sourceId)', () => {
    expect(() => FetchSourceToolInputSchema.parse({ sourceId: 'not-a-uuid' })).toThrow();
    expect(
      FetchSourceToolInputSchema.parse({
        sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      }),
    ).toEqual({ sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' });
  });

  it('validates fetch_source output against ingest run-once contract', () => {
    const summary = {
      processed: 1,
      unchanged: 0,
      changed: 0,
      firstSeen: 1,
      failed: 0,
      skipped: 0,
      archived: 0,
      persisted: 0,
      persistSkipped: 0,
      persistFailed: 0,
      published: 0,
      publishFailed: 0,
      publishSkipped: 0,
      skippedRatePolicy: 0,
      maxSourcesPerRunApplied: null,
      sourcesOmittedByCap: 0,
    };
    const ok = FetchSourceToolOutputSchema.parse({
      ok: true,
      runAt: '2026-04-04T12:00:00.000Z',
      summary,
    });
    expect(ok.ok).toBe(true);
  });

  it('validates summarize_delta output shape', () => {
    const out = SummarizeDeltaToolOutputSchema.parse({
      conciseSummary: 'A',
      keyPoints: ['b'],
      provider: { id: 'perplexity', model: 'sonar', latencyMs: 10 },
    });
    expect(out.keyPoints).toHaveLength(1);
  });

  it('parses invoke result union', () => {
    const success = SignalInternalToolInvokeResultSchema.parse({
      ok: true,
      tool: 'extract_events',
      output: { ok: true, skipped: true, reason: 'extraction_disabled' },
    });
    expect(success.ok).toBe(true);

    const failure = SignalInternalToolInvokeResultSchema.parse({
      ok: false,
      tool: 'summarize_delta',
      error: 'not_implemented',
      message: 'not ready',
    });
    expect(failure.ok).toBe(false);
  });
});
