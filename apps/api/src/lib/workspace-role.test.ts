import { describe, expect, it } from 'vitest';
import { parseWorkspaceRole, roleAtLeast } from './workspace-role';

describe('roleAtLeast', () => {
  it('viewer is not analyst or admin', () => {
    expect(roleAtLeast('viewer', 'viewer')).toBe(true);
    expect(roleAtLeast('viewer', 'analyst')).toBe(false);
    expect(roleAtLeast('viewer', 'admin')).toBe(false);
  });

  it('analyst is analyst and below admin but not viewer-only checks for admin', () => {
    expect(roleAtLeast('analyst', 'viewer')).toBe(true);
    expect(roleAtLeast('analyst', 'analyst')).toBe(true);
    expect(roleAtLeast('analyst', 'admin')).toBe(false);
  });

  it('admin satisfies all', () => {
    expect(roleAtLeast('admin', 'viewer')).toBe(true);
    expect(roleAtLeast('admin', 'analyst')).toBe(true);
    expect(roleAtLeast('admin', 'admin')).toBe(true);
  });
});

describe('parseWorkspaceRole', () => {
  it('parses valid roles', () => {
    expect(parseWorkspaceRole('admin')).toBe('admin');
    expect(parseWorkspaceRole('analyst')).toBe('analyst');
    expect(parseWorkspaceRole('viewer')).toBe('viewer');
  });

  it('returns null for invalid values', () => {
    expect(parseWorkspaceRole('superuser')).toBeNull();
    expect(parseWorkspaceRole(null)).toBeNull();
  });
});
