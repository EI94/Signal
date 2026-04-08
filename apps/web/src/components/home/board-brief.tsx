'use client';

import type { BoardSummaryV1Response, SignalSummaryV1 } from '@signal/contracts';
import { Badge, Button, Drawer, EmptyState, Skeleton, Surface } from '@signal/ui';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BoardSummaryFetchError, fetchBoardSummary } from '../../lib/api/fetch-board-summary';
import { getSignalApiBaseUrl } from '../../lib/api/signal-api';
import {
  cappedEntityRefs,
  formatCompactDate,
  formatRelativeTime,
  SIGNAL_TYPE_BADGE,
  SIGNAL_TYPE_LABEL,
} from '../../lib/signal-display';
import { AuthPanel } from '../auth/auth-panel';
import { useAuth } from '../auth/auth-provider';
import { SignalDetailDrawer } from '../signals/signal-detail-drawer';

const REFRESH_INTERVAL_MS = 60_000;

type BoardState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: BoardSummaryV1Response; fetchedAt: Date }
  | { status: 'error'; message: string; statusCode: number | null };

export function BoardBrief() {
  const { configured, loading: authLoading, user } = useAuth();
  const apiBase = getSignalApiBaseUrl();
  const [state, setState] = useState<BoardState>({ status: 'idle' });
  const [drawerSignal, setDrawerSignal] = useState<SignalSummaryV1 | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!apiBase) return;
      if (!silent) setState({ status: 'loading' });
      try {
        const token = user ? await user.getIdToken() : null;
        const data = await fetchBoardSummary(apiBase, token);
        setState({ status: 'ok', data, fetchedAt: new Date() });
      } catch (e) {
        if (silent) return;
        const statusCode = e instanceof BoardSummaryFetchError ? e.statusCode : null;
        setState({
          status: 'error',
          message: e instanceof Error ? e.message : 'Request failed',
          statusCode,
        });
      }
    },
    [user, apiBase],
  );

  useEffect(() => {
    if (!configured || !apiBase || authLoading) return;
    void load();
  }, [configured, authLoading, apiBase, load]);

  useEffect(() => {
    if (state.status !== 'ok') return;
    intervalRef.current = setInterval(() => void load(true), REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state.status, load]);

  if (!configured) return <AuthPanel />;
  if (authLoading) return <PulseSkeleton />;

  if (!apiBase) {
    return (
      <Surface>
        <p className="pulse-error__message">
          API not configured. Set <code>NEXT_PUBLIC_SIGNAL_API_BASE_URL</code>.
        </p>
      </Surface>
    );
  }

  if (state.status === 'idle' || state.status === 'loading') return <PulseSkeleton />;

  if (state.status === 'error') {
    return (
      <Surface>
        <div className="pulse-error">
          <p className="pulse-error__message">{state.message}</p>
          {state.statusCode !== 403 && (
            <Button type="button" onClick={() => void load()}>
              Retry
            </Button>
          )}
        </div>
      </Surface>
    );
  }

  const { data, fetchedAt } = state;

  if (data.topSignals.length === 0 && !data.highlights) {
    return (
      <EmptyState
        title="No signals yet"
        description="Signals will appear here once sources are processed and events are promoted."
      />
    );
  }

  const hero = data.topSignals[0];
  const rest = data.topSignals.slice(1, 8);
  const byType = groupByType(data.topSignals);
  const insights = computePulseInsights(data.topSignals);

  return (
    <div className="pulse">
      <PulseHeader fetchedAt={fetchedAt} count={data.topSignals.length} />

      {insights.length > 0 && (
        <div className="pulse-insights">
          {insights.map((ins) => (
            <div key={ins.label} className="pulse-insight">
              <span className="pulse-insight__value">{ins.value}</span>
              <span className="pulse-insight__label">{ins.label}</span>
            </div>
          ))}
        </div>
      )}

      {hero && (
        <button type="button" className="pulse-hero" onClick={() => setDrawerSignal(hero)}>
          <div className="pulse-hero__score">{hero.compositeScore ?? '—'}</div>
          <div className="pulse-hero__body">
            <Badge variant={SIGNAL_TYPE_BADGE[hero.signalType] ?? 'neutral'}>
              {SIGNAL_TYPE_LABEL[hero.signalType] ?? hero.signalType}
            </Badge>
            <h2 className="pulse-hero__title">{hero.title}</h2>
            {hero.shortSummary && <p className="pulse-hero__summary">{hero.shortSummary}</p>}
            <div className="pulse-hero__meta">
              <span>{formatCompactDate(hero.detectedAt)}</span>
              {hero.sourceLabel && <span className="pulse-hero__source">{hero.sourceLabel}</span>}
              {hero.primaryEntityRefs && hero.primaryEntityRefs.length > 0 && (
                <PulseEntityTags refs={hero.primaryEntityRefs} />
              )}
            </div>
          </div>
        </button>
      )}

      {byType.length > 0 && (
        <div className="pulse-sections">
          {byType.map((group) => (
            <Surface key={group.type}>
              <div className="pulse-section__header">
                <Badge variant={SIGNAL_TYPE_BADGE[group.type] ?? 'neutral'}>
                  {SIGNAL_TYPE_LABEL[group.type] ?? group.type}
                </Badge>
                <span className="pulse-section__count">
                  {group.items.length} {group.items.length === 1 ? 'signal' : 'signals'}
                </span>
              </div>
              <div className="pulse-section__items">
                {group.items.slice(0, 4).map((s) => (
                  <PulseSignalCard key={s.signalId} signal={s} onClick={setDrawerSignal} />
                ))}
              </div>
            </Surface>
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <Surface>
          <h3 className="pulse-section__title">Latest activity</h3>
          <div className="pulse-feed-compact">
            {rest.map((s) => (
              <PulseSignalCard key={s.signalId} signal={s} onClick={setDrawerSignal} />
            ))}
          </div>
          <Link href="/signals" className="pulse-view-all">
            View all signals →
          </Link>
        </Surface>
      )}

      <Drawer open={!!drawerSignal} onClose={() => setDrawerSignal(null)}>
        {drawerSignal && <SignalDetailDrawer signal={drawerSignal} />}
      </Drawer>
    </div>
  );
}

function PulseHeader({ fetchedAt, count }: { fetchedAt: Date; count: number }) {
  return (
    <div className="pulse-header">
      <div className="pulse-header__left">
        <span className="pulse-header__live" />
        <span className="pulse-header__count">
          {count} active {count === 1 ? 'signal' : 'signals'}
        </span>
      </div>
      <div className="pulse-header__right">
        <span className="pulse-header__ago">Updated {formatRelativeTime(fetchedAt)}</span>
      </div>
    </div>
  );
}

function PulseSignalCard({
  signal: s,
  onClick,
}: {
  signal: SignalSummaryV1;
  onClick: (s: SignalSummaryV1) => void;
}) {
  return (
    <button type="button" className="pulse-card" onClick={() => onClick(s)}>
      <div className="pulse-card__top">
        <span className="pulse-card__score">{s.compositeScore ?? '—'}</span>
        <span className="pulse-card__time">{formatCompactDate(s.detectedAt)}</span>
      </div>
      <span className="pulse-card__title">{s.title}</span>
      {s.shortSummary && <span className="pulse-card__summary">{s.shortSummary}</span>}
      {s.primaryEntityRefs && s.primaryEntityRefs.length > 0 && (
        <PulseEntityTags refs={s.primaryEntityRefs} />
      )}
      {s.sourceLabel && <span className="pulse-card__source">{s.sourceLabel}</span>}
    </button>
  );
}

function PulseEntityTags({
  refs,
}: {
  refs: Array<{ entityType: string; entityId: string; displayName?: string }>;
}) {
  const { visible, overflow } = cappedEntityRefs(refs);
  return (
    <span className="pulse-entities">
      {visible.map((r) => (
        <span key={`${r.entityType}:${r.entityId}`} className="pulse-entity-tag">
          {r.displayName ?? r.entityId}
        </span>
      ))}
      {overflow > 0 && <span className="pulse-entity-tag pulse-entity-tag--more">+{overflow}</span>}
    </span>
  );
}

function computePulseInsights(signals: SignalSummaryV1[]) {
  if (signals.length === 0) return [];
  const insights: Array<{ label: string; value: string }> = [];

  const scores = signals.map((s) => s.compositeScore ?? 0).filter((x) => x > 0);
  if (scores.length > 0) {
    insights.push({
      label: 'Avg score',
      value: String(Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)),
    });
  }

  const highImpact = signals.filter((s) => (s.compositeScore ?? 0) >= 70);
  if (highImpact.length > 0) {
    insights.push({ label: 'High impact', value: String(highImpact.length) });
  }

  const typeCounts = new Map<string, number>();
  for (const s of signals) typeCounts.set(s.signalType, (typeCounts.get(s.signalType) ?? 0) + 1);
  insights.push({ label: 'Categories', value: String(typeCounts.size) });

  const entitySet = new Set<string>();
  for (const s of signals) {
    for (const r of s.primaryEntityRefs ?? []) entitySet.add(`${r.entityType}:${r.entityId}`);
  }
  if (entitySet.size > 0) {
    insights.push({ label: 'Entities', value: String(entitySet.size) });
  }

  return insights;
}

function groupByType(signals: SignalSummaryV1[]) {
  const map = new Map<string, SignalSummaryV1[]>();
  for (const s of signals) {
    const arr = map.get(s.signalType) ?? [];
    arr.push(s);
    map.set(s.signalType, arr);
  }
  return Array.from(map.entries())
    .filter(([, items]) => items.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3)
    .map(([type, items]) => ({ type, items }));
}

function PulseSkeleton() {
  return (
    <div className="pulse">
      <Skeleton variant="text" width="14rem" />
      <Surface>
        <Skeleton variant="block" />
      </Surface>
      <div className="pulse-sections">
        <Surface>
          <Skeleton variant="text" width="8rem" />
          <Skeleton variant="block" className="pulse-skeleton__row" />
          <Skeleton variant="block" className="pulse-skeleton__row" />
        </Surface>
        <Surface>
          <Skeleton variant="text" width="8rem" />
          <Skeleton variant="block" className="pulse-skeleton__row" />
        </Surface>
      </div>
    </div>
  );
}
