'use client';

import type { SignalSummaryV1 } from '@signal/contracts';
import { getCountryNameByIso2 } from '@signal/contracts';
import type { User } from 'firebase/auth';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { type SignalEnrichment, fetchSignalEnrichment } from '../../lib/api/fetch-signal-enrich';
import { entityPath } from '../../lib/entity-route';
import { formatCompactDate } from '../../lib/signal-display';
import { SignalChat } from './signal-chat';
import { useWatchEntity } from './use-watch-entity';

type SignalDrawerProps = {
  signal: SignalSummaryV1;
  relatedSignals: SignalSummaryV1[];
  onClose: () => void;
  onFilterCountry: (iso2: string) => void;
  onFilterEntity: (entityType: string, entityId: string) => void;
  onSelectRelated: (signal: SignalSummaryV1) => void;
  isAuthenticated: boolean;
  user: User | null;
};

const TYPE_LABELS: Record<string, string> = {
  project_award: 'Project Award',
  partnership_mou: 'Partnership / MoU',
  earnings_reporting_update: 'Earnings Update',
  ma_divestment: 'M&A / Divestment',
  technology_milestone: 'Technology Milestone',
};

const TYPE_COLORS: Record<string, string> = {
  project_award: '#198754',
  partnership_mou: '#60a5fa',
  earnings_reporting_update: '#f59e0b',
  ma_divestment: '#dc3545',
  technology_milestone: '#8b5cf6',
};

const WATCH_LABELS: Record<string, string> = {
  idle: 'Watch this entity',
  saving: 'Saving…',
  done: 'Watching ✓',
  error: 'Failed — retry',
};

export function SignalDrawer({
  signal,
  relatedSignals,
  onClose,
  onFilterCountry,
  onFilterEntity,
  onSelectRelated,
  isAuthenticated,
  user,
}: SignalDrawerProps) {
  const [activeTab, setActiveTab] = useState<'detail' | 'chat'>('detail');
  const [enrichment, setEnrichment] = useState<SignalEnrichment | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);

  const typeLabel = TYPE_LABELS[signal.signalType] ?? signal.signalType;
  const typeColor = TYPE_COLORS[signal.signalType] ?? '#6b7280';

  const { watchState, watchEntity, resetWatch } = useWatchEntity(user);
  const primaryEntity = signal.primaryEntityRefs?.[0];

  useEffect(() => {
    let cancelled = false;
    setEnrichLoading(true);
    setEnrichment(null);
    fetchSignalEnrichment(signal.signalId)
      .then((data) => {
        if (!cancelled) setEnrichment(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setEnrichLoading(false);
      });
    return () => { cancelled = true; };
  }, [signal.signalId]);

  const handleWatch = useCallback(() => {
    if (watchState === 'error') { resetWatch(); return; }
    if (watchState !== 'idle' || !primaryEntity) return;
    watchEntity({
      entityType: primaryEntity.entityType,
      entityId: primaryEntity.entityId,
      displayName: primaryEntity.displayName,
    });
  }, [watchState, primaryEntity, watchEntity, resetWatch]);

  const displaySummary = enrichment?.enrichedSummary ?? signal.shortSummary;
  const sourceUrl = signal.sourceUrl ?? enrichment?.sourceUrl;
  const sourceLabel = signal.sourceLabel ?? enrichment?.sourceLabel;

  return (
    <div className="signal-drawer" role="dialog" aria-label="Signal detail">
      {/* Header */}
      <div className="signal-drawer__header">
        <div className="signal-drawer__header-top">
          <span className="signal-drawer__type-pill" style={{ background: typeColor }}>
            {typeLabel}
          </span>
          {signal.compositeScore != null && (
            <span className="signal-drawer__score-badge">
              {signal.compositeScore}
            </span>
          )}
          <button type="button" className="signal-drawer__close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <h2 className="signal-drawer__title">{signal.title}</h2>
        <div className="signal-drawer__time-row">
          <span>Detected {formatCompactDate(signal.detectedAt)}</span>
          {signal.sourcePublishedAt && (
            <span> · Published {formatCompactDate(signal.sourcePublishedAt)}</span>
          )}
        </div>
      </div>

      {/* Source banner — always visible */}
      <div className="signal-drawer__source-banner">
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="signal-drawer__source-link"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
              <path d="M5.5 2.5H3.5C2.948 2.5 2.5 2.948 2.5 3.5V10.5C2.5 11.052 2.948 11.5 3.5 11.5H10.5C11.052 11.5 11.5 11.052 11.5 10.5V8.5M8.5 2.5H11.5V5.5M11.5 2.5L6 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="signal-drawer__source-name">
              {sourceLabel ?? new URL(sourceUrl).hostname}
            </span>
            <span className="signal-drawer__source-action">Read source</span>
          </a>
        ) : (
          <span className="signal-drawer__source-unavailable">
            Source not yet available
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div className="signal-drawer__tabs">
        <button
          type="button"
          className={`signal-drawer__tab ${activeTab === 'detail' ? 'signal-drawer__tab--active' : ''}`}
          onClick={() => setActiveTab('detail')}
        >
          Intelligence
        </button>
        <button
          type="button"
          className={`signal-drawer__tab ${activeTab === 'chat' ? 'signal-drawer__tab--active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          Ask AI
        </button>
      </div>

      {/* Body */}
      <div className="signal-drawer__body">
        {activeTab === 'detail' ? (
          <>
            {/* AI Summary */}
            <div className="signal-drawer__section">
              <h3 className="signal-drawer__section-title">
                Analysis
                {enrichLoading && <span className="signal-drawer__loading-dot" />}
              </h3>
              {enrichLoading && !displaySummary ? (
                <div className="signal-drawer__skeleton">
                  <div className="signal-drawer__skeleton-line" style={{ width: '100%' }} />
                  <div className="signal-drawer__skeleton-line" style={{ width: '85%' }} />
                  <div className="signal-drawer__skeleton-line" style={{ width: '70%' }} />
                </div>
              ) : displaySummary ? (
                <p className="signal-drawer__text">{displaySummary}</p>
              ) : (
                <p className="signal-drawer__text signal-drawer__text--muted">
                  No analysis available yet. Click &ldquo;Ask AI&rdquo; to explore this signal.
                </p>
              )}
            </div>

            {/* Geography */}
            {signal.countryCodes && signal.countryCodes.length > 0 && (
              <div className="signal-drawer__section">
                <h3 className="signal-drawer__section-title">Geography</h3>
                <div className="signal-drawer__chips">
                  {signal.countryCodes.map((code) => (
                    <button
                      key={code}
                      type="button"
                      className="signal-drawer__chip"
                      onClick={() => onFilterCountry(code)}
                    >
                      {getCountryNameByIso2(code) ?? code}
                    </button>
                  ))}
                  {enrichment?.cityName && (
                    <span className="signal-drawer__chip signal-drawer__chip--city">
                      {enrichment.cityName}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Entities */}
            {signal.primaryEntityRefs && signal.primaryEntityRefs.length > 0 && (
              <div className="signal-drawer__section">
                <h3 className="signal-drawer__section-title">Entities</h3>
                <div className="signal-drawer__entity-list">
                  {signal.primaryEntityRefs.map((ref) => (
                    <div key={`${ref.entityType}:${ref.entityId}`} className="signal-drawer__entity-item">
                      <Link
                        href={entityPath(ref.entityType, ref.entityId)}
                        className="signal-drawer__entity-name"
                      >
                        {ref.displayName ?? ref.entityId}
                      </Link>
                      <div className="signal-drawer__entity-btns">
                        <button
                          type="button"
                          className="signal-drawer__mini-btn"
                          onClick={() => onFilterEntity(ref.entityType, ref.entityId)}
                        >
                          Filter
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Related */}
            {relatedSignals.length > 0 && (
              <div className="signal-drawer__section">
                <h3 className="signal-drawer__section-title">Related</h3>
                <div className="signal-drawer__related-list">
                  {relatedSignals.slice(0, 5).map((s) => (
                    <button
                      key={s.signalId}
                      type="button"
                      className="signal-drawer__related-card"
                      onClick={() => onSelectRelated(s)}
                    >
                      <span className="signal-drawer__related-type" style={{ color: TYPE_COLORS[s.signalType] ?? '#6b7280' }}>
                        {TYPE_LABELS[s.signalType] ?? s.signalType}
                      </span>
                      <span className="signal-drawer__related-title">{s.title}</span>
                      <span className="signal-drawer__related-time">{formatCompactDate(s.detectedAt)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Watch CTA */}
            <div className="signal-drawer__cta-bar">
              {isAuthenticated && primaryEntity ? (
                <button
                  type="button"
                  className={`signal-drawer__watch-btn ${watchState === 'done' ? 'signal-drawer__watch-btn--done' : ''}`}
                  onClick={handleWatch}
                  disabled={watchState === 'saving'}
                >
                  {WATCH_LABELS[watchState]}
                </button>
              ) : !isAuthenticated ? (
                <Link href="/auth" className="signal-drawer__auth-link">
                  Sign in to personalize
                </Link>
              ) : null}
            </div>
          </>
        ) : (
          <SignalChat signalId={signal.signalId} signalTitle={signal.title} />
        )}
      </div>
    </div>
  );
}
