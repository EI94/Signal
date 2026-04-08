'use client';

import { Button } from '@signal/ui';
import { type FormEvent, useCallback, useState } from 'react';
import { useAuth } from './auth-provider';

type Mode = 'sign-in' | 'sign-up' | 'reset';

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/invalid-email': 'Invalid email address.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Check your connection.',
};

function friendlyError(e: unknown): string {
  if (e && typeof e === 'object' && 'code' in e) {
    const code = (e as { code: string }).code;
    return FIREBASE_ERROR_MESSAGES[code] ?? `Authentication error (${code})`;
  }
  return e instanceof Error ? e.message : 'An unexpected error occurred.';
}

export function EmailAuthForm() {
  const { signInWithEmail, signUpWithEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setError(null);
    setResetSent(false);
    setPassword('');
    setConfirmPassword('');
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setResetSent(false);

      if (mode === 'sign-up' && password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      setPending(true);
      try {
        if (mode === 'sign-in') {
          await signInWithEmail(email, password);
        } else if (mode === 'sign-up') {
          await signUpWithEmail(email, password);
        } else {
          await resetPassword(email);
          setResetSent(true);
        }
      } catch (err) {
        setError(friendlyError(err));
      } finally {
        setPending(false);
      }
    },
    [mode, email, password, confirmPassword, signInWithEmail, signUpWithEmail, resetPassword],
  );

  return (
    <form className="email-auth-form" onSubmit={handleSubmit}>
      <div className="email-auth-form__tabs">
        <button
          type="button"
          className={`email-auth-form__tab ${mode === 'sign-in' ? 'email-auth-form__tab--active' : ''}`}
          onClick={() => switchMode('sign-in')}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`email-auth-form__tab ${mode === 'sign-up' ? 'email-auth-form__tab--active' : ''}`}
          onClick={() => switchMode('sign-up')}
        >
          Sign up
        </button>
      </div>

      <div className="email-auth-form__fields">
        <label className="email-auth-form__label">
          <span className="email-auth-form__label-text">Email</span>
          <input
            type="email"
            className="email-auth-form__input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </label>

        {mode !== 'reset' && (
          <label className="email-auth-form__label">
            <span className="email-auth-form__label-text">Password</span>
            <input
              type="password"
              className="email-auth-form__input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              placeholder="••••••••"
            />
          </label>
        )}

        {mode === 'sign-up' && (
          <label className="email-auth-form__label">
            <span className="email-auth-form__label-text">Confirm password</span>
            <input
              type="password"
              className="email-auth-form__input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </label>
        )}
      </div>

      {error && <p className="email-auth-form__error">{error}</p>}
      {resetSent && (
        <p className="email-auth-form__success">Password reset email sent. Check your inbox.</p>
      )}

      <Button type="submit" disabled={pending}>
        {pending
          ? 'Please wait…'
          : mode === 'sign-in'
            ? 'Sign in'
            : mode === 'sign-up'
              ? 'Create account'
              : 'Send reset link'}
      </Button>

      {mode === 'sign-in' && (
        <button type="button" className="email-auth-form__link" onClick={() => switchMode('reset')}>
          Forgot password?
        </button>
      )}
      {mode === 'reset' && (
        <button
          type="button"
          className="email-auth-form__link"
          onClick={() => switchMode('sign-in')}
        >
          Back to sign in
        </button>
      )}
    </form>
  );
}
