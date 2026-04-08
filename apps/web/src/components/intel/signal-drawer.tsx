'use client';

import type { SignalSummaryV1 } from '@signal/contracts';
import { getCountryNameByIso2 } from '@signal/contracts';
import type { User } from 'firebase/auth';
import Link from 'next/link';
import { entityPath } from '../../lib/entity-route';
import { formatCompactDate } from '../../lib/signal-display';
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

const ATTRIBUTION_LABELS: Record<string, string> = {
  explicit_geography: 'Extracted from content',
  source_linked_geography: 'Source-linked geography',
  text_inferred_geography: 'Inferred from title',
  hq_fallback: 'Organization HQ (fallback)',
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
  const typeLabel = TYPE_LABELS[signal.signalType] ?? signal.signalType;
  const attrLabel = signal.countryAttributionMode
    ? ATTRIBUTION_LABELS[signal.countryAttributionMode]
    : null;

  const { watchState, watchEntity, resetWatch } = useWatchEntity(user);

  const primaryEntity = signal.primaryEntityRefs?.[0];

  const handleWatch = () => {
    if (watchState === 'error') {
      resetWatch();
      return;
    }
    if (watchState !== 'idle' || !primaryEntity) return;
    watchEntity({
      entityType: primaryEntity.entityType,
      entityId: primaryEntity.entityId,
      displayName: primaryEntity.displayName,
    });
  };

  const timeLabel = signal.sourceTimeSemantic === 'published' ? 'Published' : 'Observed';

  return (
    <div className="signal-drawer" role="dialog" aria-label="Signal detail">
      <div className="signal-drawer__header">
        <h2 className="signal-drawer__title">{signal.title}</h2>
        <button type="button" className="signal-drawer__close" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </div>

      <div className="signal-drawer__body">
        <div className="signal-drawer__meta-row">
          <span className="signal-drawer__type-badge">{typeLabel}</span>
          {signal.compositeScore != null && (
            <span className="signal-drawer__score">Score {signal.compositeScore}</span>
          )}
          <span className="signal-drawer__time">
            Detected {formatCompactDate(signal.detectedAt)}
          </span>
        </div>

        {signal.shortSummary && (
          <div className="signal-drawer__section">
            <h3 className="signal-drawer__section-title">Why it matters</h3>
            <p className="signal-drawer__text">{signal.shortSummary}</p>
          </div>
        )}

        {/* Source provenance */}
        <div className="signal-drawer__section signal-drawer__provenance">
          <h3 className="signal-drawer__section-title">Source provenance</h3>
          <div className="signal-drawer__provenance-grid">
            {signal.sourceLabel && (
              <div className="signal-drawer__provenance-row">
                <span className="signal-drawer__provenance-label">Publisher</span>
                <span className="signal-drawer__provenance-value">{signal.sourceLabel}</span>
              </div>
            )}
            {signal.sourcePublishedAt && (
              <div className="signal-drawer__provenance-row">
                <span className="signal-drawer__provenance-label">{timeLabel}</span>
                <span className="signal-drawer__provenance-value">
                  {formatCompactDate(signal.sourcePublishedAt)}
                </span>
              </div>
            )}
            {signal.sourceUrl && (
              <div className="signal-drawer__provenance-row">
                <span className="signal-drawer__provenance-label">Link</span>
                <a
                  href={signal.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="signal-drawer__open-source"
                >
                  Open original source &rarr;
                </a>
              </div>
            )}
            {!signal.sourceLabel && !signal.sourceUrl && (
              <span className="signal-drawer__provenance-na">Source metadata unavailable</span>
            )}
          </div>
        </div>

        {/* Country section */}
        {signal.countryCodes && signal.countryCodes.length > 0 && (
          <div className="signal-drawer__section">
            <h3 className="signal-drawer__section-title">Geography</h3>
            <div className="signal-drawer__countries">
              {signal.countryCodes.map((code) => (
                <button
                  key={code}
                  type="button"
                  className="signal-drawer__country-chip"
                  onClick={() => onFilterCountry(code)}
                  title={`Focus map on ${getCountryNameByIso2(code) ?? code}`}
                >
                  <span className="signal-drawer__country-code">{code}</span>
                  <span className="signal-drawer__country-name">
                    {getCountryNameByIso2(code) ?? code}
                  </span>
                </button>
              ))}
            </div>
            {attrLabel && (
              <span className="signal-drawer__attribution-mode" title="How country was determined">
                {attrLabel}
              </span>
            )}
          </div>
        )}

        {/* Entities */}
        {signal.primaryEntityRefs && signal.primaryEntityRefs.length > 0 && (
          <div className="signal-drawer__section">
            <h3 className="signal-drawer__section-title">Linked entities</h3>
            <div className="signal-drawer__entities">
              {signal.primaryEntityRefs.map((ref) => (
                <div
                  key={`${ref.entityType}:${ref.entityId}`}
                  className="signal-drawer__entity-row"
                >
                  <Link
                    href={entityPath(ref.entityType, ref.entityId)}
                    className="signal-drawer__entity-link"
                  >
                    {ref.displayName ?? ref.entityId}
                  </Link>
                  <div className="signal-drawer__entity-actions">
                    <button
                      type="button"
                      className="signal-drawer__action-btn"
                      onClick={() => onFilterEntity(ref.entityType, ref.entityId)}
                    >
                      Focus
                    </button>
                    <Link
                      href={entityPath(ref.entityType, ref.entityId)}
                      className="signal-drawer__action-btn"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Related signals */}
        {relatedSignals.length > 0 && (
          <div className="signal-drawer__section">
            <h3 className="signal-drawer__section-title">Related signals</h3>
            <div className="signal-drawer__related">
              {relatedSignals.slice(0, 5).map((s) => (
                <button
                  key={s.signalId}
                  type="button"
                  className="signal-drawer__related-item"
                  onClick={() => onSelectRelated(s)}
                >
                  <span className="signal-drawer__related-title">{s.title}</span>
                  <span className="signal-drawer__related-time">
                    {formatCompactDate(s.detectedAt)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Auth CTAs — real actions */}
        <div className="signal-drawer__cta-bar">
          {isAuthenticated && primaryEntity ? (
            <button
              type="button"
              className={`signal-drawer__action-btn signal-drawer__action-btn--primary ${watchState === 'done' ? 'signal-drawer__action-btn--success' : ''}`}
              onClick={handleWatch}
              disabled={watchState === 'saving'}
            >
              {WATCH_LABELS[watchState]}
            </button>
          ) : isAuthenticated && !primaryEntity ? null : (
            <Link href="/auth" className="signal-drawer__personalize-link">
              Sign in to watch &amp; personalize &rarr;
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
