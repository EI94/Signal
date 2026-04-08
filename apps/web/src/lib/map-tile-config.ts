/**
 * Leaflet tile URL + attribution from env. In `NODE_ENV === 'production'`, a missing
 * tile URL is explicit degradation (no silent public OSM fallback).
 */
export type MapTileLayerResolved =
  | { kind: 'ok'; urlTemplate: string; attribution: string }
  | { kind: 'production_missing'; message: string };

const DEV_FALLBACK_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEV_FALLBACK_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const PRODUCTION_MISSING_MESSAGE =
  'Map tiles are not configured for this deployment. Set NEXT_PUBLIC_SIGNAL_MAP_TILE_URL (and optionally NEXT_PUBLIC_SIGNAL_MAP_ATTRIBUTION). Public tile fallbacks are disabled in production builds.';

/** Pure resolver for tests and for injecting env without mutating `process.env`. */
export function resolveMapTileLayerConfigFromEnv(env: NodeJS.ProcessEnv): MapTileLayerResolved {
  const url = env.NEXT_PUBLIC_SIGNAL_MAP_TILE_URL?.trim();
  const attributionRaw = env.NEXT_PUBLIC_SIGNAL_MAP_ATTRIBUTION?.trim();

  if (url) {
    return {
      kind: 'ok',
      urlTemplate: url,
      attribution: attributionRaw ?? 'Map tiles',
    };
  }

  if (env.NODE_ENV === 'production') {
    return {
      kind: 'production_missing',
      message: PRODUCTION_MISSING_MESSAGE,
    };
  }

  return {
    kind: 'ok',
    urlTemplate: DEV_FALLBACK_URL,
    attribution: DEV_FALLBACK_ATTRIBUTION,
  };
}

export function resolveMapTileLayerConfig(): MapTileLayerResolved {
  return resolveMapTileLayerConfigFromEnv(process.env);
}
