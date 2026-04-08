export type PrimaryNavKey =
  | 'overview'
  | 'signals'
  | 'map'
  | 'notifications'
  | 'watchlists'
  | 'settings';

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function getPrimaryNavActiveKey(pathname: string): PrimaryNavKey | null {
  const p = normalizePathname(pathname);
  if (p === '/') return 'overview';
  if (p === '/signals') return 'signals';
  if (p === '/map') return 'map';
  if (p === '/notifications') return 'notifications';
  if (p === '/watchlists') return 'watchlists';
  if (p === '/settings') return 'settings';
  if (p.startsWith('/entities')) return null;
  if (p.startsWith('/auth')) return null;
  return null;
}
