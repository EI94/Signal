'use client';

import { Button, Surface } from '@signal/ui';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from './auth-provider';
import { EmailAuthForm } from './email-auth-form';
import { WorkspaceSession } from './workspace-session';

export function AuthGate() {
  const { configured, loading, user, signInWithGoogle, signOutUser } = useAuth();

  if (!configured) {
    return (
      <div className="auth-gate">
        <Surface className="auth-gate__card">
          <p className="auth-panel__note">
            Firebase is not configured. Add <code>NEXT_PUBLIC_FIREBASE_*</code> env vars.
          </p>
        </Surface>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="auth-gate">
        <Surface className="auth-gate__card">
          <p className="auth-panel__muted">Checking session…</p>
        </Surface>
      </div>
    );
  }

  if (user) {
    return (
      <div className="auth-gate">
        <Surface className="auth-gate__card">
          <h1 className="auth-gate__title">Welcome back</h1>
          <div className="auth-gate__user-info">
            {user.photoURL && (
              <Image
                src={user.photoURL}
                alt=""
                className="auth-gate__avatar"
                width={48}
                height={48}
                unoptimized
              />
            )}
            <div>
              <p className="auth-gate__name">{user.displayName ?? 'User'}</p>
              <p className="auth-gate__email">{user.email}</p>
            </div>
          </div>
          {!user.emailVerified && user.email && (
            <p className="auth-gate__verify-note">
              Your email is not yet verified. Check your inbox for a verification link.
            </p>
          )}
          <WorkspaceSession />
          <div className="auth-gate__actions">
            <Link href="/">
              <Button type="button">Go to Pulse</Button>
            </Link>
            <Link href="/settings">
              <Button type="button" variant="ghost">
                Settings
              </Button>
            </Link>
            <Button type="button" variant="ghost" onClick={() => void signOutUser()}>
              Sign out
            </Button>
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <div className="auth-gate">
      <Surface className="auth-gate__card">
        <h1 className="auth-gate__title">Sign in to Signal</h1>
        <p className="auth-panel__muted">
          Access personalized watchlists, notifications and preferences.
        </p>
        <EmailAuthForm />
        <div className="auth-panel__divider">
          <span className="auth-panel__divider-text">or</span>
        </div>
        <Button type="button" onClick={() => void signInWithGoogle()}>
          Sign in with Google
        </Button>
      </Surface>
    </div>
  );
}
