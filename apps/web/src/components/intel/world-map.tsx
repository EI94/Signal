'use client';

import type { CountryStatus, SignalSummaryV1 } from '@signal/contracts';
import { useCallback, useMemo, useState } from 'react';
import { COUNTRY_PATHS } from '../../lib/world-map-paths';

type WorldMapProps = {
  countries: CountryStatus[];
  signals: SignalSummaryV1[];
  selectedCountry: string | null;
  onCountryClick: (iso2: string) => void;
  onSignalClick?: (signal: SignalSummaryV1) => void;
};

const STATUS_FILL: Record<string, string> = {
  red: '#dc3545',
  yellow: '#e6a700',
  green: '#198754',
  neutral: 'var(--sg-surface-elevated, #2a2d35)',
};

const STATUS_FILL_HOVER: Record<string, string> = {
  red: '#e4606d',
  yellow: '#f0c040',
  green: '#3da96e',
  neutral: 'var(--sg-border, #3d4048)',
};

const SIGNAL_TYPE_DOT: Record<string, { color: string; label: string }> = {
  ma_divestment: { color: '#dc3545', label: 'M&A' },
  project_award: { color: '#2ecc71', label: 'Award' },
  partnership_mou: { color: '#4a9aba', label: 'Partnership' },
  earnings_reporting_update: { color: '#e6a700', label: 'Earnings' },
  technology_milestone: { color: '#9b59b6', label: 'Tech' },
};

function fixDateLinePath(d: string): string {
  const parts = d.split(/(?=[MLHVCSQTAZ])/i);
  let lastX = 0;
  let output = '';

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const cmd = trimmed[0];
    if (cmd === 'Z' || cmd === 'z') {
      output += 'Z';
      continue;
    }
    const coordStr = trimmed.slice(1).trim();
    const nums = coordStr.split(/[,\s]+/).map(Number);
    if ((cmd === 'L' || cmd === 'M') && nums.length >= 2) {
      const x = nums[0] ?? 0;
      if (cmd === 'L' && Math.abs(x - lastX) > 400) {
        output += `Z M${coordStr}`;
      } else {
        output += trimmed;
      }
      lastX = x;
    } else {
      output += trimmed;
    }
  }
  return output;
}

type SignalDot = {
  iso2: string;
  x: number;
  y: number;
  count: number;
  dominantType: string;
  topTitle: string;
  topScore: number;
};

function getCountryCenter(iso2: string): [number, number] {
  const entry = COUNTRY_PATHS.find((c) => c.iso2 === iso2);
  if (entry) return [entry.cx, entry.cy];
  return [500, 250];
}

function buildSignalDots(signals: SignalSummaryV1[]): SignalDot[] {
  const byCountry = new Map<string, SignalSummaryV1[]>();
  for (const s of signals) {
    const code = s.primaryCountryCode;
    if (!code) continue;
    const list = byCountry.get(code) ?? [];
    list.push(s);
    byCountry.set(code, list);
  }

  const dots: SignalDot[] = [];
  for (const [iso2, sigs] of byCountry) {
    const typeCounts = new Map<string, number>();
    for (const s of sigs) {
      typeCounts.set(s.signalType, (typeCounts.get(s.signalType) ?? 0) + 1);
    }
    let dominantType: string = sigs[0]?.signalType ?? 'ma_divestment';
    let maxCount = 0;
    for (const [t, c] of typeCounts) {
      if (c > maxCount) {
        maxCount = c;
        dominantType = t;
      }
    }
    const sorted = [...sigs].sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));
    const [cx, cy] = getCountryCenter(iso2);
    dots.push({
      iso2,
      x: cx,
      y: cy,
      count: sigs.length,
      dominantType,
      topTitle: sorted[0]?.title ?? '',
      topScore: sorted[0]?.compositeScore ?? 0,
    });
  }
  return dots;
}

function dotRadius(count: number): number {
  if (count >= 10) return 6;
  if (count >= 5) return 4.5;
  if (count >= 2) return 3.5;
  return 2.5;
}

export function WorldMap({
  countries,
  signals,
  selectedCountry,
  onCountryClick,
  onSignalClick,
}: WorldMapProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoveredDot, setHoveredDot] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const statusMap = useMemo(() => {
    const m = new Map<string, CountryStatus>();
    for (const c of countries) m.set(c.iso2, c);
    return m;
  }, [countries]);

  const signalDots = useMemo(() => buildSignalDots(signals), [signals]);

  const getFill = useCallback(
    (iso2: string, isHovered: boolean) => {
      const cs = statusMap.get(iso2);
      if (!cs) return isHovered ? STATUS_FILL_HOVER.neutral : STATUS_FILL.neutral;
      return isHovered
        ? (STATUS_FILL_HOVER[cs.status] ?? STATUS_FILL_HOVER.neutral)
        : (STATUS_FILL[cs.status] ?? STATUS_FILL.neutral);
    },
    [statusMap],
  );

  const hoveredCountryData = hovered ? statusMap.get(hovered) : null;
  const hoveredDotData = hoveredDot ? signalDots.find((d) => d.iso2 === hoveredDot) : null;

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const handleDotClick = useCallback(
    (iso2: string) => {
      if (!onSignalClick) return;
      const sig = signals.find((s) => s.primaryCountryCode === iso2);
      if (sig) onSignalClick(sig);
    },
    [signals, onSignalClick],
  );

  return (
    <div className="world-map">
      <svg
        viewBox="0 0 1000 500"
        className="world-map__svg"
        aria-label="World intelligence map"
        onMouseMove={handleMouseMove}
      >
        <defs>
          <filter id="dot-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="0" y="0" width="1000" height="500" fill="var(--sg-bg, #1a1d23)" rx="4" />

        {COUNTRY_PATHS.map(({ iso2, d, name }) => {
          const isSelected = selectedCountry === iso2;
          const isHovered = hovered === iso2;
          const pathD = fixDateLinePath(d);
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: SVG path needs click/hover for map
            <path
              key={iso2}
              d={pathD}
              fill={getFill(iso2, isHovered || isSelected)}
              stroke={isSelected ? '#60a5fa' : 'rgba(255,255,255,0.08)'}
              strokeWidth={isSelected ? 1.2 : 0.3}
              className="world-map__country"
              data-iso2={iso2}
              tabIndex={0}
              aria-label={name}
              onClick={() => onCountryClick(iso2)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onCountryClick(iso2);
              }}
              onMouseEnter={() => setHovered(iso2)}
              onMouseLeave={() => setHovered(null)}
              style={{ transition: 'fill 0.15s, stroke 0.15s, stroke-width 0.15s' }}
            />
          );
        })}

        {signalDots.map((dot) => {
          const r = dotRadius(dot.count);
          const color = SIGNAL_TYPE_DOT[dot.dominantType]?.color ?? '#4a9aba';
          const isHighScore = dot.topScore >= 60;
          return (
            <g key={`dot-${dot.iso2}`}>
              {isHighScore && (
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r={r + 3}
                  fill="none"
                  stroke={color}
                  strokeWidth={0.5}
                  opacity={0.4}
                  className="world-map__dot-pulse"
                />
              )}
              <circle
                cx={dot.x}
                cy={dot.y}
                r={r}
                fill={color}
                stroke="rgba(0,0,0,0.5)"
                strokeWidth={0.5}
                opacity={0.9}
                filter="url(#dot-glow)"
                style={{ cursor: 'pointer', transition: 'r 0.2s' }}
                onMouseEnter={() => setHoveredDot(dot.iso2)}
                onMouseLeave={() => setHoveredDot(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDotClick(dot.iso2);
                }}
              />
              {dot.count > 1 && (
                <text
                  x={dot.x}
                  y={dot.y + 0.8}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontSize={r > 4 ? 5 : 4}
                  fontWeight="700"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {dot.count}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {(hovered || hoveredDot) && (
        <div
          className="world-map__tooltip"
          style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 10 }}
        >
          {hoveredDot && hoveredDotData ? (
            <>
              <div className="world-map__tooltip-header">
                <strong>
                  {COUNTRY_PATHS.find((c) => c.iso2 === hoveredDot)?.name ?? hoveredDot}
                </strong>
                <span
                  className="world-map__tooltip-status"
                  style={{
                    background: `${SIGNAL_TYPE_DOT[hoveredDotData.dominantType]?.color ?? '#4a9aba'}33`,
                    color: SIGNAL_TYPE_DOT[hoveredDotData.dominantType]?.color ?? '#4a9aba',
                  }}
                >
                  {SIGNAL_TYPE_DOT[hoveredDotData.dominantType]?.label ?? hoveredDotData.dominantType}
                </span>
              </div>
              <span className="world-map__tooltip-count">
                {hoveredDotData.count} signal{hoveredDotData.count !== 1 ? 's' : ''} &middot;
                Score {hoveredDotData.topScore}
              </span>
              <span className="world-map__tooltip-signal">{hoveredDotData.topTitle}</span>
            </>
          ) : hovered ? (
            <>
              <div className="world-map__tooltip-header">
                <strong>{COUNTRY_PATHS.find((c) => c.iso2 === hovered)?.name ?? hovered}</strong>
                {hoveredCountryData && (
                  <span
                    className={`world-map__tooltip-status world-map__tooltip-status--${hoveredCountryData.status}`}
                  >
                    {hoveredCountryData.status}
                  </span>
                )}
              </div>
              {hoveredCountryData ? (
                <>
                  <span className="world-map__tooltip-count">
                    {hoveredCountryData.signalCount} signal
                    {hoveredCountryData.signalCount !== 1 ? 's' : ''}
                  </span>
                  {hoveredCountryData.topSignalTitle && (
                    <span className="world-map__tooltip-signal">
                      {hoveredCountryData.topSignalTitle}
                    </span>
                  )}
                </>
              ) : (
                <span className="world-map__tooltip-count">No activity</span>
              )}
            </>
          ) : null}
        </div>
      )}

      <div className="world-map__legend">
        {(['red', 'yellow', 'green', 'neutral'] as const).map((status) => (
          <span key={status} className="world-map__legend-item">
            <span className="world-map__legend-dot" style={{ background: STATUS_FILL[status] }} />
            {status === 'red'
              ? 'Risk'
              : status === 'yellow'
                ? 'Watch'
                : status === 'green'
                  ? 'Positive'
                  : 'Quiet'}
          </span>
        ))}
      </div>
    </div>
  );
}
