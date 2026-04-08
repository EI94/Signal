'use client';

import type { MapSignalPointV1 } from '@signal/contracts';
import { Surface } from '@signal/ui';
import type { Map as LeafletMap } from 'leaflet';
import { useEffect, useRef } from 'react';
import { resolveMapTileLayerConfig } from '../../lib/map-tile-config';
import 'leaflet/dist/leaflet.css';

function scoreToRadius(score: number | null | undefined): number {
  if (score === null || score === undefined) return 6;
  return Math.min(14, Math.max(4, 4 + Math.round(score / 12)));
}

/** Muted stroke/fill aligned with signal type (Leaflet-safe hex only). */
function typeColors(signalType: string): { stroke: string; fill: string } {
  switch (signalType) {
    case 'ma_divestment':
      return { stroke: '#b45309', fill: '#fcd34d' };
    case 'technology_milestone':
      return { stroke: '#15803d', fill: '#86efac' };
    case 'earnings_reporting_update':
      return { stroke: '#a16207', fill: '#fde047' };
    case 'partnership_mou':
      return { stroke: '#0369a1', fill: '#7dd3fc' };
    default:
      return { stroke: '#6d28d9', fill: '#c4b5fd' };
  }
}

type MapLeafletViewProps = {
  points: MapSignalPointV1[];
  onSelectPoint: (p: MapSignalPointV1) => void;
};

/**
 * Thin Leaflet integration: configured tile URL (or non-prod OSM fallback) + circle markers only.
 */
export function MapLeafletView(props: MapLeafletViewProps) {
  const tiles = resolveMapTileLayerConfig();
  if (tiles.kind === 'production_missing') {
    return (
      <Surface className="map-leaflet map-leaflet--degraded" role="alert">
        <p className="map-leaflet-degraded__title">Map tiles unavailable</p>
        <p className="map-leaflet-degraded__text">{tiles.message}</p>
      </Surface>
    );
  }
  return (
    <MapLeafletViewWithTiles
      urlTemplate={tiles.urlTemplate}
      attribution={tiles.attribution}
      points={props.points}
      onSelectPoint={props.onSelectPoint}
    />
  );
}

function MapLeafletViewWithTiles({
  urlTemplate,
  attribution,
  points,
  onSelectPoint,
}: MapLeafletViewProps & { urlTemplate: string; attribution: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const onSelectRef = useRef(onSelectPoint);
  onSelectRef.current = onSelectPoint;

  useEffect(() => {
    if (!containerRef.current || points.length === 0) return;

    let cancelled = false;

    void import('leaflet').then((Leaflet) => {
      if (cancelled || !containerRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const L = Leaflet;
      const el = containerRef.current;
      const map = L.map(el, { scrollWheelZoom: true });
      mapRef.current = map;

      L.tileLayer(urlTemplate, {
        attribution,
        maxZoom: 19,
      }).addTo(map);

      const fg = L.featureGroup();
      for (const p of points) {
        if (p.lat === undefined || p.lng === undefined) continue;
        const { stroke, fill } = typeColors(p.signalType);
        const cm = L.circleMarker([p.lat, p.lng], {
          radius: scoreToRadius(p.compositeScore),
          weight: 1,
          color: stroke,
          fillColor: fill,
          fillOpacity: 0.55,
        });
        cm.on('click', () => {
          onSelectRef.current(p);
        });
        cm.addTo(fg);
      }
      fg.addTo(map);

      const b = fg.getBounds();
      if (b.isValid()) {
        map.fitBounds(b, { padding: [32, 32], maxZoom: 11 });
      }
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [points, urlTemplate, attribution]);

  return (
    <div
      ref={containerRef}
      className="map-leaflet"
      role="application"
      aria-label="Signal locations map"
    />
  );
}
