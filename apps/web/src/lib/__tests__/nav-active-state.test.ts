import { describe, expect, it } from 'vitest';
import { getPrimaryNavActiveKey } from '../nav-active-state';

describe('getPrimaryNavActiveKey', () => {
  it('highlights overview on /', () => {
    expect(getPrimaryNavActiveKey('/')).toBe('overview');
  });

  it('highlights signals on /signals (query not in pathname)', () => {
    expect(getPrimaryNavActiveKey('/signals')).toBe('signals');
  });

  it('normalizes trailing slash for primary routes', () => {
    expect(getPrimaryNavActiveKey('/signals/')).toBe('signals');
  });

  it('highlights map and notifications', () => {
    expect(getPrimaryNavActiveKey('/map')).toBe('map');
    expect(getPrimaryNavActiveKey('/notifications')).toBe('notifications');
  });

  it('does not highlight any primary item for /entities/*', () => {
    expect(getPrimaryNavActiveKey('/entities/client/acme')).toBeNull();
  });

  it('highlights settings and watchlists', () => {
    expect(getPrimaryNavActiveKey('/settings')).toBe('settings');
    expect(getPrimaryNavActiveKey('/watchlists')).toBe('watchlists');
  });

  it('returns null for unrelated paths', () => {
    expect(getPrimaryNavActiveKey('/unknown')).toBeNull();
  });
});
