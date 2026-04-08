import type { NotificationsListV1Response } from '@signal/contracts';

export class NotificationsListFetchError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | null,
  ) {
    super(message);
    this.name = 'NotificationsListFetchError';
  }
}

const DEFAULT_LIMIT = 50;

/**
 * Build the URL for `GET /v1/notifications` (workspace resolved server-side; optional query echo).
 */
export function buildNotificationsListUrl(
  apiBase: string,
  options?: { cursor?: string | null; limit?: number; status?: 'unread' | 'read' | 'dismissed' },
): string {
  const params = new URLSearchParams();
  if (options?.cursor) params.set('cursor', options.cursor);
  params.set('limit', String(options?.limit ?? DEFAULT_LIMIT));
  if (options?.status) params.set('status', options.status);
  const qs = params.toString();
  return `${apiBase}/v1/notifications${qs ? `?${qs}` : ''}`;
}

export async function fetchNotificationsList(
  apiBase: string,
  idToken: string,
  options?: { cursor?: string | null; limit?: number; status?: 'unread' | 'read' | 'dismissed' },
): Promise<NotificationsListV1Response> {
  const url = buildNotificationsListUrl(apiBase, options);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const message = extractApiErrorMessage(body) ?? `HTTP ${res.status}`;
    throw new NotificationsListFetchError(message, res.status);
  }

  return (await res.json()) as NotificationsListV1Response;
}

function extractApiErrorMessage(body: unknown): string | null {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: { message?: string } }).error;
    if (err?.message) return err.message;
  }
  return null;
}
