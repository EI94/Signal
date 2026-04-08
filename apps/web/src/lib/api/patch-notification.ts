import type { NotificationPatchBodyV1, NotificationPatchV1Response } from '@signal/contracts';

export class NotificationPatchFetchError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | null,
  ) {
    super(message);
    this.name = 'NotificationPatchFetchError';
  }
}

export function buildNotificationPatchUrl(apiBase: string, notificationId: string): string {
  const id = encodeURIComponent(notificationId);
  return `${apiBase}/v1/notifications/${id}`;
}

export async function patchNotification(
  apiBase: string,
  idToken: string,
  notificationId: string,
  body: NotificationPatchBodyV1,
): Promise<NotificationPatchV1Response> {
  const url = buildNotificationPatchUrl(apiBase, notificationId);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const parsed: unknown = await res.json().catch(() => null);
    const message = extractApiErrorMessage(parsed) ?? `HTTP ${res.status}`;
    throw new NotificationPatchFetchError(message, res.status);
  }

  return (await res.json()) as NotificationPatchV1Response;
}

function extractApiErrorMessage(body: unknown): string | null {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: { message?: string } }).error;
    if (err?.message) return err.message;
  }
  return null;
}
