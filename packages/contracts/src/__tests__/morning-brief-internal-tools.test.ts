import { describe, expect, it } from 'vitest';
import { safeParseInternalToolSuccessOutput } from '../internal-tools';

describe('safeParseInternalToolSuccessOutput — generate_brief', () => {
  it('accepts MorningBriefGenerationResult', () => {
    const out = safeParseInternalToolSuccessOutput('generate_brief', {
      briefId: 'b1',
      briefType: 'daily_workspace',
      workspaceId: 'ws',
      periodStart: '2026-04-05T00:00:00.000Z',
      periodEnd: '2026-04-05T23:59:59.999Z',
      summaryRef: 'gs://bucket/x',
      markdownChars: 100,
      sourceSignalIds: ['s1'],
      modelAssisted: false,
    });
    expect(out.ok).toBe(true);
  });
});
