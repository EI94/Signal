import { describe, expect, it } from 'vitest';
import {
  EXPOSED_TOOL_DESCRIPTORS,
  ExposedToolNameSchema,
  parseExposedToolInput,
  ToolExposureExecuteRequestSchema,
  ToolExposureExecuteResponseSchema,
  ToolsExposureListV1ResponseSchema,
} from '../tool-exposure';

describe('tool exposure contracts', () => {
  it('lists stable descriptor count', () => {
    expect(EXPOSED_TOOL_DESCRIPTORS.length).toBe(9);
    expect(
      EXPOSED_TOOL_DESCRIPTORS.every((d) => ExposedToolNameSchema.safeParse(d.name).success),
    ).toBe(true);
  });

  it('parses execute request envelope', () => {
    const r = ToolExposureExecuteRequestSchema.safeParse({
      tool: 'board_summary.get',
      input: {},
    });
    expect(r.success).toBe(true);
  });

  it('parseExposedToolInput validates signals_feed.get query', () => {
    const p = parseExposedToolInput('signals_feed.get', { limit: 10 });
    expect(p.ok).toBe(true);
  });

  it('parseExposedToolInput rejects invalid entity_context.get', () => {
    const p = parseExposedToolInput('entity_context.get', { entityType: 'x' });
    expect(p.ok).toBe(false);
  });

  it('parseExposedToolInput accepts source.fetch', () => {
    const p = parseExposedToolInput('source.fetch', {
      sourceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    });
    expect(p.ok).toBe(true);
  });

  it('ToolExposureExecuteResponse discriminates success', () => {
    const r = ToolExposureExecuteResponseSchema.safeParse({
      ok: true,
      tool: 'board_summary.get',
      kind: 'read',
      output: { x: 1 },
    });
    expect(r.success).toBe(true);
  });

  it('ToolsExposureListV1ResponseSchema', () => {
    const r = ToolsExposureListV1ResponseSchema.safeParse({ tools: [...EXPOSED_TOOL_DESCRIPTORS] });
    expect(r.success).toBe(true);
  });
});
