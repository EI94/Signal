'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '../auth/auth-provider';

export function HeaderAuthLink() {
  const { configured, loading, user } = useAuth();

  if (!configured || loading) return null;

  if (user) {
    return (
      <Link href="/settings" className="header-auth-link" aria-label="Account settings">
        {user.photoURL ? (
          <Image
            src={user.photoURL}
            alt=""
            className="header-auth-link__avatar"
            width={24}
            height={24}
            unoptimized
          />
        ) : (
          <span className="header-auth-link__initial">
            {(user.displayName ?? user.email ?? 'U').charAt(0).toUpperCase()}
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link href="/auth" className="sg-shell-nav__link">
      Sign in
    </Link>
  );
}
