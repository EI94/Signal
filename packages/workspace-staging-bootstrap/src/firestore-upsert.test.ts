import { describe, expect, it } from 'vitest';
import { runStagingWorkspaceBootstrap } from './firestore-upsert';

describe('runStagingWorkspaceBootstrap', () => {
  it('dry-run does not require db', async () => {
    const r = await runStagingWorkspaceBootstrap({
      db: null,
      workspaceId: 'ws_maire_staging',
      uid: 'test-uid',
      role: 'admin',
      now: new Date('2026-01-01T00:00:00.000Z'),
      apply: false,
    });
    expect(r.workspace).toBe('dry-run');
    expect(r.member).toBe('dry-run');
  });
});
