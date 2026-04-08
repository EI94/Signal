import { describe, expect, it } from 'vitest';
import { buildNotificationPatchUrl } from './patch-notification';

describe('buildNotificationPatchUrl', () => {
  it('encodes notification id in path', () => {
    expect(buildNotificationPatchUrl('http://localhost:4000', 'n/1')).toBe(
      'http://localhost:4000/v1/notifications/n%2F1',
    );
  });
});
