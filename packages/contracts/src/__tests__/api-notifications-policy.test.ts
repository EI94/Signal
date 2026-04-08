import { describe, expect, it } from 'vitest';
import { isBroadcastNotificationItem } from '../api-notifications';

describe('isBroadcastNotificationItem', () => {
  it('is true when userId is absent or empty', () => {
    expect(isBroadcastNotificationItem({})).toBe(true);
    expect(isBroadcastNotificationItem({ userId: undefined })).toBe(true);
    expect(isBroadcastNotificationItem({ userId: '' })).toBe(true);
  });

  it('is false when userId is set', () => {
    expect(isBroadcastNotificationItem({ userId: 'uid-1' })).toBe(false);
  });
});
