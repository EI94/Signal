import { beforeEach, describe, expect, it, vi } from 'vitest';
import { patchWorkspaceNotification } from './notification-patch';

const mockGet = vi.fn();
const mockUpdate = vi.fn();

vi.mock('../lib/firestore/workspace-collections', () => ({
  workspaceNotificationsCollection: vi.fn(() => ({
    doc: vi.fn(() => ({
      get: mockGet,
      update: mockUpdate,
    })),
  })),
}));

vi.mock('firebase-admin', () => ({
  default: {
    firestore: {
      FieldValue: {
        serverTimestamp: vi.fn(() => ({})),
      },
    },
  },
}));

const db = {} as never;

const baseDoc = {
  type: 'alert',
  title: 'Hello',
  status: 'unread' as const,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('patchWorkspaceNotification', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockUpdate.mockReset();
  });

  it('refuses broadcast notifications (no userId)', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...baseDoc }),
    });
    const r = await patchWorkspaceNotification({
      db,
      workspaceId: 'ws',
      notificationId: 'n1',
      uid: 'user-1',
      requestedStatus: 'read',
    });
    expect(r).toEqual({ ok: false, error: { code: 'broadcast_immutable' } });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns forbidden when userId does not match caller', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ...baseDoc, userId: 'other' }),
    });
    const r = await patchWorkspaceNotification({
      db,
      workspaceId: 'ws',
      notificationId: 'n1',
      uid: 'me',
      requestedStatus: 'read',
    });
    expect(r).toEqual({ ok: false, error: { code: 'forbidden' } });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('updates when userId matches', async () => {
    mockGet
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ ...baseDoc, userId: 'me' }),
      })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          ...baseDoc,
          userId: 'me',
          status: 'read',
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        }),
      });
    const r = await patchWorkspaceNotification({
      db,
      workspaceId: 'ws',
      notificationId: 'n1',
      uid: 'me',
      requestedStatus: 'read',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.notification.status).toBe('read');
      expect(r.notification.userId).toBe('me');
    }
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
