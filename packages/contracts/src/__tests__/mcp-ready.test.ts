import { describe, expect, it } from 'vitest';
import {
  listMcpReadyCapabilities,
  McpReadyCapabilitiesListV1ResponseSchema,
  McpReadyCapabilityV1Schema,
} from '../mcp-ready';
import { EXPOSED_TOOL_NAMES } from '../tool-exposure';

describe('mcp-ready (WS11.2)', () => {
  it('listMcpReadyCapabilities returns one entry per exposed tool with stable shape', () => {
    const caps = listMcpReadyCapabilities();
    expect(caps.length).toBe(EXPOSED_TOOL_NAMES.length);
    for (const c of caps) {
      expect(McpReadyCapabilityV1Schema.safeParse(c).success).toBe(true);
      expect(c.executionSurface).toBe('exposed_tools_v1');
      expect(c.authBoundary).toBe('authenticated_workspace_membership');
      expect(c.workspaceResolution).toBe('server_injected_from_membership');
    }
  });

  it('McpReadyCapabilitiesListV1ResponseSchema accepts list output', () => {
    const body = { capabilities: [...listMcpReadyCapabilities()] };
    const p = McpReadyCapabilitiesListV1ResponseSchema.safeParse(body);
    expect(p.success).toBe(true);
  });

  it('read tools are available; action tools require upstream intel in descriptor', () => {
    const caps = listMcpReadyCapabilities();
    for (const c of caps) {
      if (c.kind === 'read') {
        expect(c.availability).toBe('available');
      } else {
        expect(c.availability).toBe('action_requires_upstream_intel');
      }
    }
  });
});
