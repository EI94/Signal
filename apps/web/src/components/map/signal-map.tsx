'use client';

import type { MapSignalPointV1 } from '@signal/contracts';
import { Badge, Button, Drawer, EmptyState, Skeleton, Surface } from '@signal/ui';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchMapSignals,
  type MapFilters,
  MapSignalsFetchError,
} from '../../lib/api/fetch-map-signals';
import { getSignalApiBaseUrl } from '../../lib/api/signal-api';
import { entityPath } from '../../lib/entity-route';
import {
  formatRegionKeyLabel,
  groupByRegionKey,
  partitionMapPoints,
  sortedRegionKeys,
} from '../../lib/map/partition-map-points';
import { formatCompactDate, SIGNAL_TYPE_BADGE, SIGNAL_TYPE_LABEL } from '../../lib/signal-display';
import { AuthPanel } from '../auth/auth-panel';
import { useAuth } from '../auth/auth-provider';
import { SignInToPersonalizePrompt } from '../auth/sign-in-to-personalize-prompt';
import { MapLeafletView } from './map-leaflet-view';

const PAGE_SIZE = 100;

export function SignalMap() {
  const { configured, loading: authLoading, user } = useAuth();
  const apiBase = getSignalApiBaseUrl();

  const [filters, setFilters] = useState<MapFilters>({});
  const [points, setPoints] = useState<MapSignalPointV1[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{ message: string; statusCode: number | null } | null>(null);
  const [selected, setSelected] = useState<MapSignalPointV1 | null>(null);

  const { withCoords, withoutCoords } = useMemo(() => partitionMapPoints(points), [points]);
  const regionGroups = useMemo(() => groupByRegionKey(withoutCoords), [withoutCoords]);
  const regionKeys = useMemo(() => sortedRegionKeys(regionGroups), [regionGroups]);

  const onSelectPoint = useCallback((p: MapSignalPointV1) => {
    setSelected(p);
  }, []);

  useEffect(() => {
    if (!configured || !apiBase) return;
    if (authLoading) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPoints([]);
    setNextPageToken(null);

    void (async () => {
      try {
        const token = user ? await user.getIdToken() : null;
        const data = await fetchMapSignals(apiBase, token, filters, null, PAGE_SIZE);
        if (cancelled) return;
        setPoints(data.points);
        setNextPageToken(data.nextPageToken);
      } catch (e) {
        if (cancelled) return;
        const statusCode = e instanceof MapSignalsFetchError ? e.statusCode : null;
        setError({ message: e instanceof Error ? e.message : 'Request failed', statusCode });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [configured, authLoading, user, apiBase, filters]);

  const loadMore = useCallback(async () => {
    if (!apiBase || !nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const token = user ? await user.getIdToken() : null;
      const data = await fetchMapSignals(apiBase, token, filters, nextPageToken, PAGE_SIZE);
      setPoints((prev) => [...prev, ...data.points]);
      setNextPageToken(data.nextPageToken);
    } catch (e) {
      const statusCode = e instanceof MapSignalsFetchError ? e.statusCode : null;
      setError({ message: e instanceof Error ? e.message : 'Request failed', statusCode });
    } finally {
      setLoadingMore(false);
    }
  }, [user, apiBase, filters, nextPageToken, loadingMore]);

  const retry = useCallback(() => {
    setFilters((f) => ({ ...f }));
  }, []);

  if (!configured) return <AuthPanel />;
  if (authLoading) return <MapPageSkeleton />;

  if (!apiBase) {
    return (
      <Surface>
        <p className="map-error__message">
          API not configured. Set <code>NEXT_PUBLIC_SIGNAL_API_BASE_URL</code>.
        </p>
      </Surface>
    );
  }

  return (
    <div className="map-page">
      {!user && <SignInToPersonalizePrompt />}
      <div className="map-controls">
        <select
          className="map-control"
          value={filters.signalType ?? ''}
          onChange={(e) => setFilters({ ...filters, signalType: e.target.value || undefined })}
          aria-label="Filter by signal type"
        >
          <option value="">All types</option>
          {Object.entries(SIGNAL_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="map-control"
          value={filters.minScore !== undefined ? String(filters.minScore) : ''}
          onChange={(e) =>
            setFilters({
              ...filters,
              minScore: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          aria-label="Minimum score"
        >
          <option value="">Any score</option>
          <option value="50">50+</option>
          <option value="70">70+</option>
          <option value="90">90+</option>
        </select>
      </div>

      {loading && <MapPageSkeleton />}

      {!loading && error && (
        <Surface>
          <div className="map-error">
            <p className="map-error__message">{error.message}</p>
            {error.statusCode !== 403 && (
              <Button type="button" onClick={retry}>
                Retry
              </Button>
            )}
          </div>
        </Surface>
      )}

      {!loading && !error && points.length === 0 && (
        <EmptyState
          title="No map signals"
          description="Nothing in the latest window matches these filters."
        />
      )}

      {!loading && !error && points.length > 0 && (
        <div className="map-shell">
          <div className="map-stage-wrap">
            {withCoords.length > 0 ? (
              <MapLeafletView points={withCoords} onSelectPoint={onSelectPoint} />
            ) : (
              <Surface className="map-stage-fallback">
                <p className="map-stage-fallback__title">No geographic coordinates</p>
                <p className="map-stage-fallback__text">
                  The read model does not attach lat/lng yet. Signals are grouped by region anchor
                  (primary entity) in the panel — no synthetic placement on the map.
                </p>
              </Surface>
            )}
          </div>
          <aside className="map-side" aria-label="Signals by region">
            <h2 className="map-side__heading">By region</h2>
            {withoutCoords.length === 0 ? (
              <p className="map-side__empty">
                {withCoords.length > 0
                  ? 'All loaded signals have coordinates on the map.'
                  : 'No rows to list.'}
              </p>
            ) : (
              <ul className="map-region-list">
                {regionKeys.map((key) => {
                  const group = regionGroups.get(key) ?? [];
                  return (
                    <li key={key} className="map-region-block">
                      <div className="map-region-block__label">
                        {formatRegionKeyLabel(key)}
                        <span className="map-region-block__count">{group.length}</span>
                      </div>
                      <ul className="map-region-block__items">
                        {group.map((p) => (
                          <li key={p.signalId}>
                            <button
                              type="button"
                              className="map-region-item"
                              onClick={() => setSelected(p)}
                            >
                              <span className="map-region-item__title">{p.title}</span>
                              <span className="map-region-item__meta">
                                {p.compositeScore ?? '—'} · {formatCompactDate(p.detectedAt)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
            {nextPageToken && (
              <div className="map-load-more">
                <Button type="button" variant="ghost" onClick={() => void loadMore()}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </aside>
        </div>
      )}

      <Drawer open={selected !== null} onClose={() => setSelected(null)}>
        {selected && <SignalContextPanel point={selected} onClose={() => setSelected(null)} />}
      </Drawer>
    </div>
  );
}

function SignalContextPanel({
  point: p,
  onClose,
}: {
  point: MapSignalPointV1;
  onClose: () => void;
}) {
  return (
    <div className="map-drawer-inner">
      <div className="map-drawer-inner__head">
        <h2 className="map-drawer-inner__title">Signal</h2>
        <Button type="button" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      <p className="map-drawer-inner__h1">{p.title}</p>
      <div className="map-drawer-inner__row">
        <Badge variant={SIGNAL_TYPE_BADGE[p.signalType] ?? 'neutral'}>
          {SIGNAL_TYPE_LABEL[p.signalType] ?? p.signalType}
        </Badge>
        <span className="map-drawer-inner__score">Score {p.compositeScore ?? '—'}</span>
      </div>
      <p className="map-drawer-inner__muted">
        Detected {formatCompactDate(p.detectedAt)} · Occurred {formatCompactDate(p.occurredAt)}
      </p>
      {p.shortSummary && <p className="map-drawer-inner__summary">{p.shortSummary}</p>}
      {p.regionKey && (
        <p className="map-drawer-inner__muted">
          Region anchor: <code>{p.regionKey}</code>
        </p>
      )}
      {p.primaryEntityRefs && p.primaryEntityRefs.length > 0 && (
        <div className="map-drawer-inner__entities">
          {p.primaryEntityRefs.map((r) => (
            <Link
              key={`${r.entityType}:${r.entityId}`}
              href={entityPath(r.entityType, r.entityId)}
              className="entity-link"
            >
              {r.displayName ?? r.entityId}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MapPageSkeleton() {
  return (
    <div className="map-page">
      <div className="map-controls">
        <Skeleton variant="text" width="8rem" height="2rem" />
        <Skeleton variant="text" width="6rem" height="2rem" />
      </div>
      <div className="map-shell map-shell--skeleton">
        <Skeleton variant="block" className="map-skeleton-stage" />
        <Skeleton variant="block" className="map-skeleton-side" />
      </div>
    </div>
  );
}
