'use client';

import type { EntityDetailV1Response, SignalSummaryV1 } from '@signal/contracts';
import { Badge, Button, Drawer, EmptyState, Skeleton, Surface } from '@signal/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EntityDetailFetchError, fetchEntityDetail } from '../../lib/api/fetch-entity-detail';
import { getSignalApiBaseUrl } from '../../lib/api/signal-api';
import { entityPath, entityTypeLabel } from '../../lib/entity-route';
import {
  cappedEntityRefs,
  formatCompactDate,
  humanizeTimelineLabel,
  SIGNAL_TYPE_BADGE,
  SIGNAL_TYPE_LABEL,
} from '../../lib/signal-display';
import { AuthPanel } from '../auth/auth-panel';
import { useAuth } from '../auth/auth-provider';
import { SignalDetailDrawer } from '../signals/signal-detail-drawer';

type DetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: EntityDetailV1Response }
  | { status: 'error'; message: string; statusCode: number | null };

export function EntityDetail({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { configured, loading: authLoading, user } = useAuth();
  const apiBase = getSignalApiBaseUrl();
  const [state, setState] = useState<DetailState>({ status: 'idle' });
  const [drawerSignal, setDrawerSignal] = useState<SignalSummaryV1 | null>(null);

  const load = useCallback(async () => {
    if (!apiBase) return;
    setState({ status: 'loading' });
    try {
      const token = user ? await user.getIdToken() : null;
      const data = await fetchEntityDetail(apiBase, token, entityType, entityId, 16);
      setState({ status: 'ok', data });
    } catch (e) {
      const statusCode = e instanceof EntityDetailFetchError ? e.statusCode : null;
      setState({
        status: 'error',
        message: e instanceof Error ? e.message : 'Request failed',
        statusCode,
      });
    }
  }, [user, apiBase, entityType, entityId]);

  useEffect(() => {
    if (!configured || !apiBase) return;
    if (authLoading) return;
    void load();
  }, [configured, authLoading, apiBase, load]);

  if (!configured) return <AuthPanel />;
  if (authLoading) return <EntitySkeleton />;

  if (!apiBase) {
    return (
      <Surface>
        <p className="entity-error__message">
          API not configured. Set <code>NEXT_PUBLIC_SIGNAL_API_BASE_URL</code>.
        </p>
      </Surface>
    );
  }

  if (state.status === 'idle' || state.status === 'loading') return <EntitySkeleton />;

  if (state.status === 'error') {
    return (
      <Surface>
        <div className="entity-error">
          <p className="entity-error__message">{state.message}</p>
          {state.statusCode !== 403 && (
            <Button type="button" onClick={() => void load()}>
              Retry
            </Button>
          )}
        </div>
      </Surface>
    );
  }

  const { data } = state;
  const { entity, recentSignals, timelinePreview } = data;
  const displayLabel = entity.displayName ?? entity.entityId;
  const stats = computeEntityStats(recentSignals);
  const signalsByType = groupSignalsByType(recentSignals);

  return (
    <div className="entity-page">
      <div className="entity-header">
        <div className="entity-identity">
          <Badge variant="neutral">{entityTypeLabel(entity.entityType)}</Badge>
          <h1 className="entity-identity__name">{displayLabel}</h1>
        </div>
        <span className="entity-identity__id">{entity.entityId}</span>
      </div>

      {stats.total > 0 && (
        <div className="entity-stats">
          <EntityStat label="Signals" value={String(stats.total)} />
          <EntityStat label="Avg score" value={String(stats.avgScore)} />
          {stats.topType && (
            <EntityStat
              label="Top type"
              value={SIGNAL_TYPE_LABEL[stats.topType] ?? stats.topType}
            />
          )}
          {stats.latestDetected && (
            <EntityStat label="Latest" value={formatCompactDate(stats.latestDetected)} />
          )}
        </div>
      )}

      {signalsByType.length > 0 && (
        <div className="entity-type-groups">
          {signalsByType.map((group) => (
            <Surface key={group.type}>
              <div className="entity-group__header">
                <Badge variant={SIGNAL_TYPE_BADGE[group.type] ?? 'neutral'}>
                  {SIGNAL_TYPE_LABEL[group.type] ?? group.type}
                </Badge>
                <span className="entity-group__count">
                  {group.items.length} {group.items.length === 1 ? 'signal' : 'signals'}
                </span>
              </div>
              <div className="entity-signals">
                {group.items.map((s) => (
                  <EntitySignalCard
                    key={s.signalId}
                    signal={s}
                    currentEntity={entity}
                    onClick={setDrawerSignal}
                  />
                ))}
              </div>
            </Surface>
          ))}
        </div>
      )}

      {recentSignals.length === 0 && (
        <EmptyState
          title="No recent signals"
          description="No signals reference this entity in the latest window."
        />
      )}

      {timelinePreview && timelinePreview.length > 0 && (
        <Surface>
          <h2 className="entity-section__title">Timeline</h2>
          <ul className="entity-timeline">
            {timelinePreview.map((t, i) => (
              <li key={t.signalId ?? `tl-${i}`} className="entity-timeline__item">
                <span className="entity-timeline__dot" />
                <span className="entity-timeline__label">{humanizeTimelineLabel(t.label)}</span>
                <span className="entity-timeline__date">{formatCompactDate(t.occurredAt)}</span>
              </li>
            ))}
          </ul>
          {data.timelineNextCursor && <p className="entity-timeline__more">More history exists.</p>}
        </Surface>
      )}

      <Drawer open={!!drawerSignal} onClose={() => setDrawerSignal(null)}>
        {drawerSignal && <SignalDetailDrawer signal={drawerSignal} />}
      </Drawer>
    </div>
  );
}

function EntityStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="entity-stat">
      <span className="entity-stat__value">{value}</span>
      <span className="entity-stat__label">{label}</span>
    </div>
  );
}

function EntitySignalCard({
  signal: s,
  currentEntity,
  onClick,
}: {
  signal: SignalSummaryV1;
  currentEntity: { entityType: string; entityId: string };
  onClick: (s: SignalSummaryV1) => void;
}) {
  const otherEntities = s.primaryEntityRefs?.filter(
    (r) => !(r.entityType === currentEntity.entityType && r.entityId === currentEntity.entityId),
  );
  const { visible: visibleOthers, overflow } = cappedEntityRefs(otherEntities);

  return (
    <button type="button" className="entity-signal-card" onClick={() => onClick(s)}>
      <div className="entity-signal-card__top">
        <span className="entity-signal-card__score">{s.compositeScore ?? '—'}</span>
        <span className="entity-signal-card__time">{formatCompactDate(s.detectedAt)}</span>
      </div>
      <span className="entity-signal-card__title">{s.title}</span>
      {s.shortSummary && <span className="entity-signal-card__summary">{s.shortSummary}</span>}
      {(s.sourceUrl || s.sourceLabel) && (
        <span className="entity-signal-card__source">
          {s.sourceLabel || (s.sourceUrl ? extractDomain(s.sourceUrl) : '')}
        </span>
      )}
      {visibleOthers.length > 0 && (
        <div className="entity-signal-card__others">
          {visibleOthers.map((r) => (
            <Link
              key={`${r.entityType}:${r.entityId}`}
              href={entityPath(r.entityType, r.entityId)}
              className="entity-signal-card__entity-link"
              onClick={(e) => e.stopPropagation()}
            >
              {r.displayName ?? r.entityId}
            </Link>
          ))}
          {overflow > 0 && (
            <span className="entity-signal-card__entity-link--more">+{overflow}</span>
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

function computeEntityStats(signals: SignalSummaryV1[]) {
  if (signals.length === 0) return { total: 0, avgScore: 0, topType: null, latestDetected: null };
  const scores = signals.map((s) => s.compositeScore ?? 0);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const typeCounts = new Map<string, number>();
  for (const s of signals) {
    typeCounts.set(s.signalType, (typeCounts.get(s.signalType) ?? 0) + 1);
  }
  let topType: string | null = null;
  let maxCount = 0;
  for (const [t, c] of typeCounts) {
    if (c > maxCount) {
      maxCount = c;
      topType = t;
    }
  }
  const first = signals[0];
  if (!first) return { total: 0, avgScore: 0, topType: null, latestDetected: null };
  const latest = signals.reduce(
    (max, s) => (s.detectedAt > max ? s.detectedAt : max),
    first.detectedAt,
  );
  return { total: signals.length, avgScore: avg, topType, latestDetected: latest };
}

function groupSignalsByType(signals: SignalSummaryV1[]) {
  const map = new Map<string, SignalSummaryV1[]>();
  for (const s of signals) {
    const arr = map.get(s.signalType) ?? [];
    arr.push(s);
    map.set(s.signalType, arr);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([type, items]) => ({ type, items }));
}

function EntitySkeleton() {
  return (
    <div className="entity-page">
      <Skeleton variant="text" width="6rem" height="1.5rem" />
      <Skeleton variant="text" width="16rem" height="1.5rem" className="entity-skeleton__gap" />
      <Surface>
        <Skeleton variant="text" width="8rem" className="entity-skeleton__gap" />
        <Skeleton variant="block" className="entity-skeleton__row" />
        <Skeleton variant="block" className="entity-skeleton__row" />
        <Skeleton variant="block" className="entity-skeleton__row" />
      </Surface>
    </div>
  );
}
