'use client';

import { Button, Surface } from '@signal/ui';
import Link from 'next/link';
import { useAuth } from './auth-provider';

type SignInToPersonalizePromptProps = {
  title?: string;
  description?: string;
};

export function SignInToPersonalizePrompt({
  title,
  description = 'Sign in to personalize your workspace and saved state.',
}: SignInToPersonalizePromptProps) {
  const { signInWithGoogle } = useAuth();
  return (
    <Surface className="sign-in-prompt" aria-label={title ?? 'Personalization'}>
      {title && (
        <p className="auth-panel__muted">
          <strong>{title}</strong>
        </p>
      )}
      <p className="auth-panel__muted">{description}</p>
      <div className="sign-in-prompt__actions">
        <Link href="/auth" className="sign-in-prompt__link">
          <Button type="button">Sign in with email</Button>
        </Link>
        <Button type="button" variant="ghost" onClick={() => void signInWithGoogle()}>
          Sign in with Google
        </Button>
      </div>
    </Surface>
  );
}
