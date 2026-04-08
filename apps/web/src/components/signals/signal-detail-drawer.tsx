'use client';

import type { SignalSummaryV1 } from '@signal/contracts';
import { Badge } from '@signal/ui';
import Link from 'next/link';
import { entityPath } from '../../lib/entity-route';
import { formatCompactDate, SIGNAL_TYPE_BADGE, SIGNAL_TYPE_LABEL } from '../../lib/signal-display';

export function SignalDetailDrawer({ signal: s }: { signal: SignalSummaryV1 }) {
  return (
    <div className="signal-drawer">
      <div className="signal-drawer__head">
        <Badge variant={SIGNAL_TYPE_BADGE[s.signalType] ?? 'neutral'}>
          {SIGNAL_TYPE_LABEL[s.signalType] ?? s.signalType}
        </Badge>
        <span className="signal-drawer__score">Score {s.compositeScore ?? '—'}</span>
      </div>

      <h2 className="signal-drawer__title">{s.title}</h2>

      <div className="signal-drawer__meta">
        <span>Detected {formatCompactDate(s.detectedAt)}</span>
        {s.occurredAt !== s.detectedAt && <span>Occurred {formatCompactDate(s.occurredAt)}</span>}
        {s.novelty && <Badge variant="accent">{s.novelty}</Badge>}
      </div>

      {s.shortSummary && (
        <div className="signal-drawer__section">
          <h3 className="signal-drawer__label">Why it matters</h3>
          <p className="signal-drawer__text">{s.shortSummary}</p>
        </div>
      )}

      {s.primaryEntityRefs && s.primaryEntityRefs.length > 0 && (
        <div className="signal-drawer__section">
          <h3 className="signal-drawer__label">Linked entities</h3>
          <div className="signal-drawer__entities">
            {s.primaryEntityRefs.map((r) => (
              <Link
                key={`${r.entityType}:${r.entityId}`}
                href={entityPath(r.entityType, r.entityId)}
                className="signal-drawer__entity-link"
              >
                {r.displayName ?? r.entityId}
              </Link>
            ))}
          </div>
        </div>
      )}

      {(s.sourceUrl || s.sourceLabel) && (
        <div className="signal-drawer__section">
          <h3 className="signal-drawer__label">Source</h3>
          {s.sourceUrl ? (
            <a
              href={s.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="signal-drawer__source-link"
            >
              {s.sourceLabel || new URL(s.sourceUrl).hostname}
              <span className="signal-drawer__external">↗</span>
            </a>
          ) : (
            <span className="signal-drawer__source-name">{s.sourceLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
