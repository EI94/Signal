import { describe, expect, it } from 'vitest';
import { resolveNotificationStatusPatch } from './notification-status-patch';

describe('resolveNotificationStatusPatch', () => {
  it('marks unread as read', () => {
    expect(resolveNotificationStatusPatch('unread', 'read')).toEqual({
      ok: true,
      nextStatus: 'read',
    });
  });

  it('is idempotent for read', () => {
    expect(resolveNotificationStatusPatch('read', 'read')).toEqual({
      ok: true,
      nextStatus: 'read',
    });
  });

  it('rejects read from dismissed', () => {
    expect(resolveNotificationStatusPatch('dismissed', 'read')).toEqual({
      ok: false,
      reason: 'invalid_transition',
    });
  });

  it('dismisses from unread or read', () => {
    expect(resolveNotificationStatusPatch('unread', 'dismissed')).toEqual({
      ok: true,
      nextStatus: 'dismissed',
    });
    expect(resolveNotificationStatusPatch('read', 'dismissed')).toEqual({
      ok: true,
      nextStatus: 'dismissed',
    });
  });

  it('is idempotent for dismissed', () => {
    expect(resolveNotificationStatusPatch('dismissed', 'dismissed')).toEqual({
      ok: true,
      nextStatus: 'dismissed',
    });
  });
});
