import { describe, expect, it } from 'vitest';
import { resolveMapTileLayerConfigFromEnv } from './map-tile-config';

describe('resolveMapTileLayerConfigFromEnv', () => {
  it('returns ok with configured URL and optional attribution', () => {
    const r = resolveMapTileLayerConfigFromEnv({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SIGNAL_MAP_TILE_URL: 'https://tiles.example/{z}/{x}/{y}.png',
      NEXT_PUBLIC_SIGNAL_MAP_ATTRIBUTION: '© Example',
    });
    expect(r).toEqual({
      kind: 'ok',
      urlTemplate: 'https://tiles.example/{z}/{x}/{y}.png',
      attribution: '© Example',
    });
  });

  it('uses default attribution label when URL set but attribution omitted', () => {
    const r = resolveMapTileLayerConfigFromEnv({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SIGNAL_MAP_TILE_URL: 'https://tiles.example/{z}/{x}/{y}.png',
      NEXT_PUBLIC_SIGNAL_MAP_ATTRIBUTION: undefined,
    });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.attribution).toBe('Map tiles');
    }
  });

  it('returns production_missing when production build and URL missing', () => {
    const r = resolveMapTileLayerConfigFromEnv({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SIGNAL_MAP_TILE_URL: undefined,
      NEXT_PUBLIC_SIGNAL_MAP_ATTRIBUTION: undefined,
    });
    expect(r.kind).toBe('production_missing');
  });

  it('allows dev OSM fallback when not production', () => {
    const r = resolveMapTileLayerConfigFromEnv({
      NODE_ENV: 'development',
      NEXT_PUBLIC_SIGNAL_MAP_TILE_URL: undefined,
      NEXT_PUBLIC_SIGNAL_MAP_ATTRIBUTION: undefined,
    });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.urlTemplate).toContain('openstreetmap.org');
    }
  });
});
