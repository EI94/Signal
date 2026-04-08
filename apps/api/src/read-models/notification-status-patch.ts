import type { NotificationStatus } from '@signal/contracts';

export type NotificationStatusPatchRequest = 'read' | 'dismissed';

export type ResolveNotificationStatusPatchResult =
  | { ok: true; nextStatus: NotificationStatus }
  | { ok: false; reason: 'invalid_transition' };

/**
 * Pure transition rules for operational notification documents.
 * - `read`: only from `unread` (idempotent if already `read`).
 * - `dismissed`: from `unread` or `read` (idempotent if already `dismissed`).
 */
export function resolveNotificationStatusPatch(
  current: NotificationStatus,
  requested: NotificationStatusPatchRequest,
): ResolveNotificationStatusPatchResult {
  if (requested === 'read') {
    if (current === 'dismissed') {
      return { ok: false, reason: 'invalid_transition' };
    }
    return { ok: true, nextStatus: 'read' };
  }
  return { ok: true, nextStatus: 'dismissed' };
}
