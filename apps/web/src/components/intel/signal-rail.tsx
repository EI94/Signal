'use client';

import type { SignalSummaryV1 } from '@signal/contracts';
import { getCountryNameByIso2 } from '@signal/contracts';
import { formatCompactDate } from '../../lib/signal-display';

type SignalRailProps = {
  signals: SignalSummaryV1[];
  onSignalClick: (signal: SignalSummaryV1) => void;
  selectedCountry: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  project_award: 'Award',
  partnership_mou: 'Partnership',
  earnings_reporting_update: 'Earnings',
  ma_divestment: 'M&A',
  technology_milestone: 'Tech',
};

const TYPE_COLORS: Record<string, string> = {
  project_award: '#198754',
  partnership_mou: '#60a5fa',
  earnings_reporting_update: '#9ca3af',
  ma_divestment: '#dc3545',
  technology_milestone: '#e6a700',
};

function groupSignals(signals: SignalSummaryV1[]): { label: string; items: SignalSummaryV1[] }[] {
  const groups: Record<string, SignalSummaryV1[]> = {
    'Top Signals': [],
    'Project Awards': [],
    'Partnerships & MoUs': [],
    'Earnings & Reports': [],
    'M&A / Divestments': [],
    Technology: [],
  };

  const sorted = [...signals].sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));
  for (const s of sorted.slice(0, 5)) groups['Top Signals']?.push(s);

  for (const s of sorted) {
    switch (s.signalType) {
      case 'project_award':
        groups['Project Awards']?.push(s);
        break;
      case 'partnership_mou':
        groups['Partnerships & MoUs']?.push(s);
        break;
      case 'earnings_reporting_update':
        groups['Earnings & Reports']?.push(s);
        break;
      case 'ma_divestment':
        groups['M&A / Divestments']?.push(s);
        break;
      case 'technology_milestone':
        groups.Technology?.push(s);
        break;
    }
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items: items.slice(0, 8) }));
}

function SignalCard({ signal, onClick }: { signal: SignalSummaryV1; onClick: () => void }) {
  const entity = signal.primaryEntityRefs?.[0];
  const typeLabel = TYPE_LABELS[signal.signalType] ?? signal.signalType;
  const typeColor = TYPE_COLORS[signal.signalType] ?? '#9ca3af';
  const countryName = signal.primaryCountryCode
    ? getCountryNameByIso2(signal.primaryCountryCode)
    : null;

  return (
    <button type="button" className="signal-card" onClick={onClick}>
      <div className="signal-card__header">
        <span className="signal-card__type" style={{ color: typeColor }}>
          {typeLabel}
        </span>
        <span
          className="signal-card__time"
          title={signal.sourceTimeSemantic === 'published' ? 'Source published' : 'Observed'}
        >
          {formatCompactDate(signal.sourcePublishedAt ?? signal.detectedAt)}
        </span>
      </div>
      <h4 className="signal-card__title">{signal.title}</h4>
      {signal.shortSummary && <p className="signal-card__summary">{signal.shortSummary}</p>}
      <div className="signal-card__meta">
        {entity && (
          <span className="signal-card__entity">{entity.displayName ?? entity.entityId}</span>
        )}
        {countryName && (
          <span className="signal-card__country" title={signal.primaryCountryCode ?? undefined}>
            {countryName}
          </span>
        )}
        {signal.sourceLabel && (
          <span className="signal-card__source" title="Publisher">
            {signal.sourceLabel}
          </span>
        )}
        {signal.sourceUrl && (
          <a
            href={signal.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="signal-card__source-link"
            onClick={(e) => e.stopPropagation()}
          >
            Source &rarr;
          </a>
        )}
      </div>
    </button>
  );
}

export function SignalRail({ signals, onSignalClick, selectedCountry }: SignalRailProps) {
  const countryName = selectedCountry ? getCountryNameByIso2(selectedCountry) : null;
  const groups = groupSignals(signals);

  return (
    <aside className="signal-rail" aria-label="Intelligence feed">
      <div className="signal-rail__header">
        <h2 className="signal-rail__title">
          {countryName ? `${countryName} — What Changed` : 'What Changed'}
        </h2>
        <span className="signal-rail__count">{signals.length} signals</span>
      </div>
      <div className="signal-rail__sections">
        {groups.map((group) => (
          <section key={group.label} className="signal-rail__section">
            <h3 className="signal-rail__section-title">{group.label}</h3>
            {group.items.map((signal) => (
              <SignalCard
                key={signal.signalId}
                signal={signal}
                onClick={() => onSignalClick(signal)}
              />
            ))}
          </section>
        ))}
        {groups.length === 0 && (
          <div className="signal-rail__empty">No signals in this time window</div>
        )}
      </div>
    </aside>
  );
}
