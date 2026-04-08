import type { NotificationItemV1 } from '@signal/contracts';

/** Optional navigation when the API exposes enough context for a real product route. */
export type NotificationContextLink = {
  href: string;
  label: string;
};

/**
 * Resolves a single “open context” link from notification fields only (no invented routes).
 * Brief/entity deep links are omitted until the serving contract includes stable refs.
 */
export function getNotificationContextLink(
  item: NotificationItemV1,
): NotificationContextLink | null {
  if (item.signalId) {
    return { href: '/signals', label: 'Signals' };
  }
  return null;
}
