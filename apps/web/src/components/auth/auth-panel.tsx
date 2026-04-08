'use client';

import { Button } from '@signal/ui';
import { useAuth } from './auth-provider';
import { EmailAuthForm } from './email-auth-form';

export function AuthPanel() {
  const { configured, loading, user, signInWithGoogle, signOutUser } = useAuth();

  if (!configured) {
    return (
      <section className="auth-panel" aria-label="Authentication status">
        <p className="auth-panel__note">
          Firebase client is not configured. Add <code>NEXT_PUBLIC_FIREBASE_*</code> variables (see{' '}
          <code>apps/web/.env.example</code>).
        </p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="auth-panel" aria-label="Authentication status">
        <p className="auth-panel__muted">Checking session…</p>
      </section>
    );
  }

  if (user) {
    return (
      <section className="auth-panel" aria-label="Authentication status">
        <div className="auth-panel__row">
          <p>
            Signed in as <strong>{user.email ?? user.uid}</strong>
          </p>
          <Button type="button" onClick={() => void signOutUser()}>
            Sign out
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-panel" aria-label="Authentication">
      <EmailAuthForm />
      <div className="auth-panel__divider">
        <span className="auth-panel__divider-text">or</span>
      </div>
      <Button type="button" onClick={() => void signInWithGoogle()}>
        Sign in with Google
      </Button>
    </section>
  );
}
