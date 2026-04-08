'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getPrimaryNavActiveKey } from '../../lib/nav-active-state';

const PRIMARY_NAV_ITEMS = [
  { href: '/', key: 'overview' as const, label: 'Pulse' },
  { href: '/signals', key: 'signals' as const, label: 'Signals' },
  { href: '/watchlists', key: 'watchlists' as const, label: 'Watchlists' },
  { href: '/notifications', key: 'notifications' as const, label: 'Notifications' },
] as const;

export function PrimaryNavLinks() {
  const pathname = usePathname();
  const active = getPrimaryNavActiveKey(pathname);

  return (
    <nav className="sg-shell-nav" aria-label="Primary">
      {PRIMARY_NAV_ITEMS.map(({ href, key, label }) => {
        const isActive = active === key;
        return (
          <Link
            key={href}
            href={href}
            className={
              isActive ? 'sg-shell-nav__link sg-shell-nav__link--active' : 'sg-shell-nav__link'
            }
            aria-current={isActive ? 'page' : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
