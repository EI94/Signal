import type { MapSignalPointV1 } from '@signal/contracts';

const UNPLACED = '__unplaced__';

type PartitionResult = {
  withCoords: MapSignalPointV1[];
  withoutCoords: MapSignalPointV1[];
};

/**
 * Split API points into coordinate-backed vs not. No geocoding — uses API fields only.
 */
export function partitionMapPoints(points: MapSignalPointV1[]): PartitionResult {
  const withCoords: MapSignalPointV1[] = [];
  const withoutCoords: MapSignalPointV1[] = [];
  for (const p of points) {
    if (p.lat !== undefined && p.lng !== undefined) {
      withCoords.push(p);
    } else {
      withoutCoords.push(p);
    }
  }
  return { withCoords, withoutCoords };
}

/**
 * Group points that lack coordinates by `regionKey` for the region fallback list.
 * Points without `regionKey` roll into a single unplaced bucket.
 */
export function groupByRegionKey(points: MapSignalPointV1[]): Map<string, MapSignalPointV1[]> {
  const m = new Map<string, MapSignalPointV1[]>();
  for (const p of points) {
    const key = p.regionKey ?? UNPLACED;
    const list = m.get(key);
    if (list) list.push(p);
    else m.set(key, [p]);
  }
  for (const [, list] of m) {
    list.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  }
  return m;
}

/**
 * Stable sort order for region groups: alphabetical by key, unplaced last.
 */
export function sortedRegionKeys(groups: Map<string, MapSignalPointV1[]>): string[] {
  const keys = [...groups.keys()];
  keys.sort((a, b) => {
    if (a === UNPLACED) return 1;
    if (b === UNPLACED) return -1;
    return a.localeCompare(b);
  });
  return keys;
}

export function isUnplacedRegionKey(key: string): boolean {
  return key === UNPLACED;
}

export function formatRegionKeyLabel(regionKey: string): string {
  if (regionKey === UNPLACED) return 'No region anchor';
  const i = regionKey.indexOf(':');
  if (i === -1) return regionKey;
  return `${regionKey.slice(0, i)} · ${regionKey.slice(i + 1)}`;
}
