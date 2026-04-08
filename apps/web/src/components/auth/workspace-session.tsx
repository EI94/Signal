'use client';

import type { AuthMeResponse } from '@signal/contracts';
import { useEffect, useState } from 'react';
import { getSignalApiBaseUrl } from '../../lib/api/signal-api';
import { useAuth } from './auth-provider';

type MeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: AuthMeResponse }
  | { status: 'forbidden'; code: string; message: string }
  | { status: 'error'; message: string };

export function WorkspaceSession() {
  const { configured, loading, user } = useAuth();
  const apiBase = getSignalApiBaseUrl();
  const [me, setMe] = useState<MeState>({ status: 'idle' });

  useEffect(() => {
    if (!configured || loading) {
      return;
    }
    if (!user) {
      setMe({ status: 'idle' });
      return;
    }
    if (!apiBase) {
      setMe({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setMe({ status: 'loading' });

    void (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${apiBase}/v1/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body: unknown = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (res.ok && body && typeof body === 'object' && 'user' in body && 'workspace' in body) {
          setMe({ status: 'ok', data: body as AuthMeResponse });
          return;
        }

        if (res.status === 403 && body && typeof body === 'object' && 'error' in body) {
          const err = body as { error?: { code?: string; message?: string } };
          const code = err.error?.code ?? 'FORBIDDEN';
          const message = err.error?.message ?? 'Access denied';
          setMe({ status: 'forbidden', code, message });
          return;
        }

        setMe({
          status: 'error',
          message:
            res.status === 401 ? 'Session expired or not authenticated' : `HTTP ${res.status}`,
        });
      } catch (e) {
        if (!cancelled) {
          setMe({ status: 'error', message: e instanceof Error ? e.message : 'Request failed' });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiBase, configured, loading, user]);

  if (!configured || loading || !user) {
    return null;
  }

  if (!apiBase) {
    return (
      <section className="auth-panel auth-panel--sub" aria-label="Workspace access">
        <p className="auth-panel__muted">
          API base URL not set. Add <code>NEXT_PUBLIC_SIGNAL_API_BASE_URL</code> (see{' '}
          <code>apps/web/.env.example</code>) to load workspace membership.
        </p>
      </section>
    );
  }

  if (me.status === 'idle' || me.status === 'loading') {
    return (
      <section className="auth-panel auth-panel--sub" aria-label="Workspace access">
        <p className="auth-panel__muted">Loading workspace access…</p>
      </section>
    );
  }

  if (me.status === 'error') {
    return (
      <section className="auth-panel auth-panel--sub" aria-label="Workspace access">
        <p className="auth-panel__warn">Could not load workspace: {me.message}</p>
      </section>
    );
  }

  if (me.status === 'forbidden') {
    return (
      <section className="auth-panel auth-panel--sub" aria-label="Workspace access">
        <p className="auth-panel__warn">
          <strong>Not provisioned</strong> ({me.code}): {me.message}
        </p>
        <p className="auth-panel__muted">
          Ask an admin to add your user to <code>workspaces/…/members/{'{uid}'}</code> in Firestore.
        </p>
      </section>
    );
  }

  const { workspace, role } = me.data;
  return (
    <section className="auth-panel auth-panel--sub" aria-label="Workspace access">
      <p>
        Workspace <strong>{workspace.name}</strong>{' '}
        <span className="auth-panel__muted">({workspace.id})</span>
      </p>
      <p>
        Role: <strong>{role}</strong>
      </p>
    </section>
  );
}
