import { describe, expect, it } from 'vitest';
import { buildNotificationsListUrl } from './fetch-notifications';

describe('buildNotificationsListUrl', () => {
  it('builds list URL with defaults', () => {
    expect(buildNotificationsListUrl('http://localhost:4000')).toBe(
      'http://localhost:4000/v1/notifications?limit=50',
    );
  });

  it('includes cursor and status', () => {
    expect(
      buildNotificationsListUrl('http://localhost:4000', {
        cursor: '10',
        limit: 25,
        status: 'unread',
      }),
    ).toBe('http://localhost:4000/v1/notifications?cursor=10&limit=25&status=unread');
  });
});
