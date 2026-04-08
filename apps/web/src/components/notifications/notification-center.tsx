'use client';

import { isBroadcastNotificationItem, type NotificationItemV1 } from '@signal/contracts';
import { Badge, Button, EmptyState, Skeleton, Surface } from '@signal/ui';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchNotificationsList,
  NotificationsListFetchError,
} from '../../lib/api/fetch-notifications';
import { patchNotification } from '../../lib/api/patch-notification';
import { getSignalApiBaseUrl } from '../../lib/api/signal-api';
import { getNotificationContextLink } from '../../lib/notification-context-link';
import { formatCompactDate } from '../../lib/signal-display';
import { AuthPanel } from '../auth/auth-panel';
import { useAuth } from '../auth/auth-provider';
import { SignInToPersonalizePrompt } from '../auth/sign-in-to-personalize-prompt';

const PAGE_SIZE = 50;

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; items: NotificationItemV1[]; nextPageToken: string | null }
  | { status: 'error'; message: string; statusCode: number | null };

function sortNotifications(items: NotificationItemV1[]): NotificationItemV1[] {
  const rank = (s: NotificationItemV1['status']): number => {
    if (s === 'unread') return 0;
    if (s === 'read') return 1;
    return 2;
  };
  return items.slice().sort((a, b) => {
    const d = rank(a.status) - rank(b.status);
    if (d !== 0) return d;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function NotificationCenter() {
  const { configured, loading: authLoading, user } = useAuth();
  const apiBase = getSignalApiBaseUrl();
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadFirst = useCallback(async () => {
    if (!user || !apiBase) return;
    setState({ status: 'loading' });
    setActionError(null);
    try {
      const token = await user.getIdToken();
      const data = await fetchNotificationsList(apiBase, token, {
        limit: PAGE_SIZE,
        cursor: null,
      });
      setState({
        status: 'ok',
        items: data.items,
        nextPageToken: data.nextPageToken,
      });
    } catch (e) {
      const statusCode = e instanceof NotificationsListFetchError ? e.statusCode : null;
      setState({
        status: 'error',
        message: e instanceof Error ? e.message : 'Request failed',
        statusCode,
      });
    }
  }, [user, apiBase]);

  useEffect(() => {
    if (!configured || authLoading || !user || !apiBase) return;
    void loadFirst();
  }, [configured, authLoading, user, apiBase, loadFirst]);

  const loadMore = useCallback(async () => {
    if (!user || !apiBase || state.status !== 'ok' || !state.nextPageToken || loadingMore) return;
    setLoadingMore(true);
    setActionError(null);
    try {
      const token = await user.getIdToken();
      const data = await fetchNotificationsList(apiBase, token, {
        limit: PAGE_SIZE,
        cursor: state.nextPageToken,
      });
      setState((prev) => {
        if (prev.status !== 'ok') return prev;
        const seen = new Set(prev.items.map((i) => i.notificationId));
        const merged = [...prev.items];
        for (const it of data.items) {
          if (!seen.has(it.notificationId)) {
            merged.push(it);
            seen.add(it.notificationId);
          }
        }
        return {
          status: 'ok',
          items: merged,
          nextPageToken: data.nextPageToken,
        };
      });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoadingMore(false);
    }
  }, [user, apiBase, state, loadingMore]);

  const applyPatch = useCallback(
    async (notificationId: string, status: 'read' | 'dismissed') => {
      if (!user || !apiBase) return;
      setPendingId(notificationId);
      setActionError(null);
      try {
        const token = await user.getIdToken();
        await patchNotification(apiBase, token, notificationId, { status });
        await loadFirst();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Update failed';
        setActionError(msg);
      } finally {
        setPendingId(null);
      }
    },
    [user, apiBase, loadFirst],
  );

  const sorted = useMemo(() => {
    if (state.status !== 'ok') return [];
    return sortNotifications(state.items);
  }, [state]);

  if (!configured) return <AuthPanel />;
  if (authLoading) return <NotificationSkeleton />;
  if (!user) {
    return (
      <SignInToPersonalizePrompt
        title="Sign in to view notifications"
        description="Notifications are tied to your workspace membership. Sign in to load and manage them."
      />
    );
  }

  if (!apiBase) {
    return (
      <Surface>
        <p className="notifications-error">
          API not configured. Set <code>NEXT_PUBLIC_SIGNAL_API_BASE_URL</code>.
        </p>
      </Surface>
    );
  }

  if (state.status === 'idle' || state.status === 'loading') return <NotificationSkeleton />;

  if (state.status === 'error') {
    return (
      <Surface>
        <div className="notifications-error">
          <p>{state.message}</p>
          {state.statusCode !== 403 && (
            <Button type="button" onClick={() => void loadFirst()}>
              Retry
            </Button>
          )}
        </div>
      </Surface>
    );
  }

  return (
    <div className="notifications">
      {actionError && (
        <Surface>
          <p className="notifications-error">{actionError}</p>
        </Surface>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          title="No notifications"
          description="Operational alerts and updates for your workspace will appear here."
        />
      ) : (
        <ul className="notifications-list">
          {sorted.map((item) => {
            const ctx = getNotificationContextLink(item);
            const broadcast = isBroadcastNotificationItem(item);
            return (
              <li key={item.notificationId}>
                <Surface>
                  <div className="notifications-row">
                    <div className="notifications-row__main">
                      <div className="notifications-row__title-line">
                        <span
                          className={item.status === 'unread' ? 'notifications-title--unread' : ''}
                        >
                          {item.title}
                        </span>
                        <Badge variant="neutral">{item.type}</Badge>
                        {broadcast && (
                          <Badge variant="neutral" title="Visible to all workspace members">
                            Workspace
                          </Badge>
                        )}
                        <StatusBadge status={item.status} />
                      </div>
                      {item.message && <p className="notifications-row__message">{item.message}</p>}
                      <p className="notifications-row__meta">{formatCompactDate(item.createdAt)}</p>
                      {ctx && (
                        <p className="notifications-row__context">
                          <Link href={ctx.href}>{ctx.label}</Link>
                        </p>
                      )}
                    </div>
                    <div className="notifications-row__actions">
                      {!broadcast && item.status === 'unread' && (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={pendingId === item.notificationId}
                          onClick={() => void applyPatch(item.notificationId, 'read')}
                        >
                          Mark read
                        </Button>
                      )}
                      {!broadcast && item.status !== 'dismissed' && (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={pendingId === item.notificationId}
                          onClick={() => void applyPatch(item.notificationId, 'dismissed')}
                        >
                          Dismiss
                        </Button>
                      )}
                    </div>
                  </div>
                </Surface>
              </li>
            );
          })}
        </ul>
      )}

      {state.nextPageToken && (
        <div className="notifications-more">
          <Button type="button" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: NotificationItemV1['status'] }) {
  if (status === 'unread') return <Badge variant="accent">Unread</Badge>;
  if (status === 'read') return <Badge variant="neutral">Read</Badge>;
  return <Badge variant="neutral">Dismissed</Badge>;
}

function NotificationSkeleton() {
  return (
    <div className="notifications">
      <Surface>
        <Skeleton variant="text" width="40%" />
        <Skeleton variant="block" className="notifications-skel-block" />
        <Skeleton variant="block" className="notifications-skel-block" />
      </Surface>
    </div>
  );
}
