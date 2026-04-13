'use client';

import type { SignalSummaryV1, SignalsFeedFacetsV1 } from '@signal/contracts';
import { Badge, Button, Drawer, EmptyState, Skeleton, Surface } from '@signal/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type FeedFilters,
  fetchSignalsFeed,
  SignalsFeedFetchError,
} from '../../lib/api/fetch-signals-feed';
import { fetchMemberPreferences } from '../../lib/api/fetch-member-preferences';
import { getSignalApiBaseUrl } from '../../lib/api/signal-api';
import { entityPath } from '../../lib/entity-route';
import {
  cappedEntityRefs,
  formatCompactDate,
  formatRelativeTime,
  SIGNAL_TYPE_BADGE,
  SIGNAL_TYPE_LABEL,
  SORT_OPTIONS,
} from '../../lib/signal-display';
import { buildSignalsPagePath, parseSignalsFeedSearchParams } from '../../lib/signals-url-state';
import { AuthPanel } from '../auth/auth-panel';
import { useAuth } from '../auth/auth-provider';
import { SignalDetailDrawer } from './signal-detail-drawer';

const PAGE_SIZE = 25;
const REFRESH_INTERVAL_MS = 60_000;

export function SignalFeed() {
  const { configured, loading: authLoading, user } = useAuth();
  const apiBase = getSignalApiBaseUrl();
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo(() => parseSignalsFeedSearchParams(searchParams), [searchParams]);

  const [items, setItems] = useState<SignalSummaryV1[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [facets, setFacets] = useState<SignalsFeedFacetsV1 | undefined>();
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{ message: string; statusCode: number | null } | null>(null);
  const [refetchNonce, setRefetchNonce] = useState(0);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [drawerSignal, setDrawerSignal] = useState<SignalSummaryV1 | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'grouped'>('cards');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [indexTagsFromPrefs, setIndexTagsFromPrefs] = useState<string[] | null>(null);

  useEffect(() => {
    if (!configured || !apiBase || authLoading) return;
    if (!user) {
      setIndexTagsFromPrefs(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const prefs = await fetchMemberPreferences(apiBase, token);
        if (cancelled) return;
        const ids = prefs?.alerting?.watchedIndexIds?.filter(Boolean) ?? [];
        setIndexTagsFromPrefs(ids.length > 0 ? ids : null);
      } catch {
        if (!cancelled) setIndexTagsFromPrefs(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, apiBase, user, authLoading, refetchNonce]);

  const feedQueryFilters = useMemo(() => {
    if (indexTagsFromPrefs && indexTagsFromPrefs.length > 0) {
      return { ...filters, marketIndexTags: indexTagsFromPrefs };
    }
    return filters;
  }, [filters, indexTagsFromPrefs]);

  const applyFilters = useCallback(
    (next: FeedFilters) => {
      router.replace(buildSignalsPagePath(next), { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    void refetchNonce;
    if (!configured || !apiBase) return;
    if (authLoading) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setItems([]);
    setNextPageToken(null);

    void (async () => {
      try {
        const token = user ? await user.getIdToken() : null;
        const data = await fetchSignalsFeed(apiBase, token, feedQueryFilters, null, PAGE_SIZE);
        if (cancelled) return;
        setItems(data.items);
        setNextPageToken(data.nextPageToken);
        if (data.facets) setFacets(data.facets);
        setLastFetchedAt(new Date());
      } catch (e) {
        if (cancelled) return;
        const statusCode = e instanceof SignalsFeedFetchError ? e.statusCode : null;
        setError({ message: e instanceof Error ? e.message : 'Request failed', statusCode });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [configured, authLoading, user, apiBase, feedQueryFilters, refetchNonce]);

  useEffect(() => {
    if (!lastFetchedAt || !apiBase || !configured) return;
    intervalRef.current = setInterval(() => setRefetchNonce((n) => n + 1), REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [lastFetchedAt, apiBase, configured]);

  const loadMore = useCallback(async () => {
    if (!apiBase || !nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const token = user ? await user.getIdToken() : null;
      const data = await fetchSignalsFeed(apiBase, token, feedQueryFilters, nextPageToken, PAGE_SIZE);
      setItems((prev) => [...prev, ...data.items]);
      setNextPageToken(data.nextPageToken);
    } catch (e) {
      const statusCode = e instanceof SignalsFeedFetchError ? e.statusCode : null;
      setError({ message: e instanceof Error ? e.message : 'Request failed', statusCode });
    } finally {
      setLoadingMore(false);
    }
  }, [user, apiBase, feedQueryFilters, nextPageToken, loadingMore]);

  const retry = useCallback(() => {
    setRefetchNonce((n) => n + 1);
  }, []);

  const filteredItems = useMemo(() => {
    if (!filters.search) return items;
    const q = filters.search.toLowerCase();
    return items.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.shortSummary?.toLowerCase().includes(q) ?? false) ||
        s.primaryEntityRefs?.some((r) =>
          (r.displayName ?? r.entityId).toLowerCase().includes(q),
        ) === true,
    );
  }, [items, filters.search]);

  if (!configured) return <AuthPanel />;
  if (authLoading) return <FeedSkeleton />;

  if (!apiBase) {
    return (
      <Surface>
        <p className="feed-error__message">
          API not configured. Set <code>NEXT_PUBLIC_SIGNAL_API_BASE_URL</code>.
        </p>
      </Surface>
    );
  }

  return (
    <div className="feed">
      <div className="feed-toolbar">
        <FilterBar filters={filters} onFiltersChange={applyFilters} facets={facets} />
        {indexTagsFromPrefs && indexTagsFromPrefs.length > 0 && (
          <span className="feed-freshness" title="From Settings → Alerting → Market indices">
            Index filter: {indexTagsFromPrefs.join(', ')}
          </span>
        )}
        {lastFetchedAt && (
          <span className="feed-freshness">Updated {formatRelativeTime(lastFetchedAt)}</span>
        )}
      </div>

      {loading && <FeedSkeleton />}

      {!loading && error && (
        <Surface>
          <div className="feed-error">
            <p className="feed-error__message">{error.message}</p>
            {error.statusCode !== 403 && (
              <Button type="button" onClick={retry}>
                Retry
              </Button>
            )}
          </div>
        </Surface>
      )}

      {!loading && !error && filteredItems.length === 0 && (
        <EmptyState
          title="No signals match"
          description="Adjust filters or wait for new signals to be processed."
        />
      )}

      {!loading && filteredItems.length > 0 && (
        <>
          <FeedViewToggle view={viewMode} onViewChange={setViewMode} />
          {viewMode === 'cards' && (
            <div className="feed-cards">
              {filteredItems.map((s) => (
                <FeedCard key={s.signalId} signal={s} onClick={setDrawerSignal} />
              ))}
            </div>
          )}
          {viewMode === 'grouped' && (
            <FeedGroupedView items={filteredItems} onSignalClick={setDrawerSignal} />
          )}
          {nextPageToken && (
            <div className="feed-load-more">
              <Button type="button" variant="ghost" onClick={() => void loadMore()}>
                {loadingMore ? 'Loading…' : 'Load more signals'}
              </Button>
            </div>
          )}
        </>
      )}

      <Drawer open={!!drawerSignal} onClose={() => setDrawerSignal(null)}>
        {drawerSignal && <SignalDetailDrawer signal={drawerSignal} />}
      </Drawer>
    </div>
  );
}

function FilterBar({
  filters,
  onFiltersChange,
  facets,
}: {
  filters: FeedFilters;
  onFiltersChange: (f: FeedFilters) => void;
  facets: SignalsFeedFacetsV1 | undefined;
}) {
  const typeOptions =
    facets?.signalTypes ?? Object.keys(SIGNAL_TYPE_LABEL).map((v) => ({ value: v, count: 0 }));
  const noveltyOptions = facets?.novelties ?? [];

  return (
    <div className="feed-filters">
      <input
        className="feed-filter feed-filter--search"
        type="search"
        placeholder="Search signals…"
        value={filters.search ?? ''}
        onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined })}
        aria-label="Search signals"
      />

      <select
        className="feed-filter"
        value={filters.signalType ?? ''}
        onChange={(e) => onFiltersChange({ ...filters, signalType: e.target.value || undefined })}
        aria-label="Filter by signal type"
      >
        <option value="">All types</option>
        {typeOptions.map((t) => (
          <option key={t.value} value={t.value}>
            {SIGNAL_TYPE_LABEL[t.value] ?? t.value}
            {t.count > 0 ? ` (${t.count})` : ''}
          </option>
        ))}
      </select>

      <select
        className="feed-filter"
        value={filters.novelty ?? ''}
        onChange={(e) => onFiltersChange({ ...filters, novelty: e.target.value || undefined })}
        aria-label="Filter by novelty"
      >
        <option value="">Any novelty</option>
        {noveltyOptions.length > 0
          ? noveltyOptions.map((n) => (
              <option key={n.value} value={n.value}>
                {n.value} {n.count > 0 ? `(${n.count})` : ''}
              </option>
            ))
          : NOVELTY_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
      </select>

      <select
        className="feed-filter"
        value={filters.sort ?? ''}
        onChange={(e) => onFiltersChange({ ...filters, sort: e.target.value || undefined })}
        aria-label="Sort order"
      >
        <option value="">Default sort</option>
        {SORT_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <select
        className="feed-filter"
        value={filters.minScore !== undefined ? String(filters.minScore) : ''}
        onChange={(e) =>
          onFiltersChange({
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
  );
}

const NOVELTY_OPTIONS = ['new', 'update', 'confirmation'] as const;

function FeedViewToggle({
  view,
  onViewChange,
}: {
  view: 'cards' | 'grouped';
  onViewChange: (v: 'cards' | 'grouped') => void;
}) {
  return (
    <div className="feed-view-toggle">
      <button
        type="button"
        className={`feed-view-btn ${view === 'cards' ? 'feed-view-btn--active' : ''}`}
        onClick={() => onViewChange('cards')}
      >
        Cards
      </button>
      <button
        type="button"
        className={`feed-view-btn ${view === 'grouped' ? 'feed-view-btn--active' : ''}`}
        onClick={() => onViewChange('grouped')}
      >
        By type
      </button>
    </div>
  );
}

function FeedGroupedView({
  items,
  onSignalClick,
}: {
  items: SignalSummaryV1[];
  onSignalClick: (s: SignalSummaryV1) => void;
}) {
  const groups = groupFeedByType(items);

  return (
    <div className="feed-grouped">
      {groups.map((g) => (
        <Surface key={g.type}>
          <div className="feed-group__header">
            <Badge variant={SIGNAL_TYPE_BADGE[g.type] ?? 'neutral'}>
              {SIGNAL_TYPE_LABEL[g.type] ?? g.type}
            </Badge>
            <span className="feed-group__count">{g.items.length}</span>
          </div>
          <div className="feed-group__items">
            {g.items.map((s) => (
              <FeedCard key={s.signalId} signal={s} onClick={onSignalClick} />
            ))}
          </div>
        </Surface>
      ))}
    </div>
  );
}

function groupFeedByType(items: SignalSummaryV1[]) {
  const map = new Map<string, SignalSummaryV1[]>();
  for (const s of items) {
    const arr = map.get(s.signalType) ?? [];
    arr.push(s);
    map.set(s.signalType, arr);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([type, groupItems]) => ({ type, items: groupItems }));
}

function FeedCard({
  signal: s,
  onClick,
}: {
  signal: SignalSummaryV1;
  onClick: (s: SignalSummaryV1) => void;
}) {
  const { visible, overflow } = cappedEntityRefs(s.primaryEntityRefs);

  return (
    <button type="button" className="feed-card" onClick={() => onClick(s)}>
      <div className="feed-card__header">
        <Badge variant={SIGNAL_TYPE_BADGE[s.signalType] ?? 'neutral'}>
          {SIGNAL_TYPE_LABEL[s.signalType] ?? s.signalType}
        </Badge>
        <span className="feed-card__score">{s.compositeScore ?? '—'}</span>
      </div>
      <span className="feed-card__title">{s.title}</span>
      {s.shortSummary && <span className="feed-card__summary">{s.shortSummary}</span>}
      <div className="feed-card__footer">
        <span className="feed-card__time">{formatCompactDate(s.detectedAt)}</span>
        {s.sourceLabel && <span className="feed-card__source">{s.sourceLabel}</span>}
        {s.sourceUrl && !s.sourceLabel && (
          <span className="feed-card__source">{extractDomain(s.sourceUrl)}</span>
        )}
      </div>
      {visible.length > 0 && (
        <div className="feed-card__entities">
          {visible.map((r) => (
            <Link
              key={`${r.entityType}:${r.entityId}`}
              href={entityPath(r.entityType, r.entityId)}
              className="feed-card__entity"
              onClick={(e) => e.stopPropagation()}
            >
              {r.displayName ?? r.entityId}
            </Link>
          ))}
          {overflow > 0 && (
            <span className="feed-card__entity feed-card__entity--more">+{overflow}</span>
          )}
        </div>
      )}
    </button>
  );
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function FeedSkeleton() {
  return (
    <div className="feed-cards">
      {['a', 'b', 'c', 'd'].map((k) => (
        <Surface key={k}>
          <Skeleton variant="text" width="6rem" />
          <Skeleton variant="text" width="80%" className="feed-skeleton__row" />
          <Skeleton variant="text" width="60%" className="feed-skeleton__row" />
        </Surface>
      ))}
    </div>
  );
}
