import { describe, expect, it } from 'vitest';
import {
  preserveMemberJoinedTimestamps,
  preserveWorkspaceRootTimestamps,
} from './merge-preserving';

describe('preserveWorkspaceRootTimestamps', () => {
  const t0 = new Date('2025-01-01T00:00:00.000Z');
  const t1 = new Date('2026-04-07T12:00:00.000Z');

  it('keeps previous createdAt on rerun', () => {
    const out = preserveWorkspaceRootTimestamps(t0, { createdAt: t1, updatedAt: t1 });
    expect(out.createdAt).toEqual(t0);
    expect(out.updatedAt).toEqual(t1);
  });

  it('uses candidate createdAt when no previous', () => {
    const out = preserveWorkspaceRootTimestamps(undefined, { createdAt: t1, updatedAt: t1 });
    expect(out.createdAt).toEqual(t1);
  });
});

describe('preserveMemberJoinedTimestamps', () => {
  const t0 = new Date('2025-06-01T00:00:00.000Z');
  const t1 = new Date('2026-04-07T12:00:00.000Z');

  it('keeps previous joinedAt on rerun', () => {
    const out = preserveMemberJoinedTimestamps(t0, { joinedAt: t1, updatedAt: t1 });
    expect(out.joinedAt).toEqual(t0);
    expect(out.updatedAt).toEqual(t1);
  });
});
