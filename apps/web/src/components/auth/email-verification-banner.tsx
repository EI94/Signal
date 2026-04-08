'use client';

import { Button } from '@signal/ui';
import { useCallback, useState } from 'react';
import { useAuth } from './auth-provider';

export function EmailVerificationBanner() {
  const { user, sendVerificationEmail } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const handleResend = useCallback(async () => {
    setSending(true);
    try {
      await sendVerificationEmail();
      setSent(true);
    } catch {
      /* Firebase rate-limits; swallow silently */
    } finally {
      setSending(false);
    }
  }, [sendVerificationEmail]);

  if (!user || user.emailVerified || dismissed) return null;

  return (
    <div className="verify-banner" role="alert">
      <p className="verify-banner__text">
        {sent
          ? 'Verification email sent — check your inbox.'
          : 'Your email is not verified. Please verify to unlock all features.'}
      </p>
      <div className="verify-banner__actions">
        {!sent && (
          <Button type="button" variant="ghost" disabled={sending} onClick={handleResend}>
            {sending ? 'Sending…' : 'Resend verification'}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => setDismissed(true)}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
