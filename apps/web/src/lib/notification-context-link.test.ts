import { describe, expect, it } from 'vitest';
import { getNotificationContextLink } from './notification-context-link';

describe('getNotificationContextLink', () => {
  it('returns Signals link when signalId is set', () => {
    expect(
      getNotificationContextLink({
        notificationId: 'a',
        type: 'alert',
        title: 'T',
        status: 'unread',
        signalId: 'sig-1',
        createdAt: '2026-04-05T12:00:00.000Z',
      }),
    ).toEqual({ href: '/signals', label: 'Signals' });
  });

  it('returns null without signal context', () => {
    expect(
      getNotificationContextLink({
        notificationId: 'a',
        type: 'alert',
        title: 'T',
        status: 'unread',
        createdAt: '2026-04-05T12:00:00.000Z',
      }),
    ).toBeNull();
  });
});
