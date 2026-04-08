'use client';

import type { CountryStatus } from '@signal/contracts';
import { useCallback, useMemo, useState } from 'react';
import { COUNTRY_PATHS } from '../../lib/world-map-paths';

type WorldMapProps = {
  countries: CountryStatus[];
  selectedCountry: string | null;
  onCountryClick: (iso2: string) => void;
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

export function WorldMap({ countries, selectedCountry, onCountryClick }: WorldMapProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const statusMap = useMemo(() => {
    const m = new Map<string, CountryStatus>();
    for (const c of countries) m.set(c.iso2, c);
    return m;
  }, [countries]);

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

  const hoveredData = hovered ? statusMap.get(hovered) : null;

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  return (
    <div className="world-map">
      <svg
        viewBox="0 0 1000 500"
        className="world-map__svg"
        aria-label="World intelligence map"
        onMouseMove={handleMouseMove}
      >
        <rect x="0" y="0" width="1000" height="500" fill="var(--sg-bg, #1a1d23)" rx="4" />
        {COUNTRY_PATHS.map(({ iso2, d, name }) => {
          const isSelected = selectedCountry === iso2;
          const isHovered = hovered === iso2;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: SVG path needs click/hover for map
            <path
              key={iso2}
              d={d}
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
      </svg>

      {hovered && (
        <div
          className="world-map__tooltip"
          style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 10 }}
        >
          <div className="world-map__tooltip-header">
            <strong>{COUNTRY_PATHS.find((c) => c.iso2 === hovered)?.name ?? hovered}</strong>
            {hoveredData && (
              <span
                className={`world-map__tooltip-status world-map__tooltip-status--${hoveredData.status}`}
              >
                {hoveredData.status}
              </span>
            )}
          </div>
          {hoveredData ? (
            <>
              <span className="world-map__tooltip-count">
                {hoveredData.signalCount} signal{hoveredData.signalCount !== 1 ? 's' : ''}
              </span>
              {hoveredData.topSignalTitle && (
                <span className="world-map__tooltip-signal">{hoveredData.topSignalTitle}</span>
              )}
            </>
          ) : (
            <span className="world-map__tooltip-count">No activity</span>
          )}
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
