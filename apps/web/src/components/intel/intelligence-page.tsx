'use client';

import type { PulseV1Response, SignalSummaryV1 } from '@signal/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPulse } from '../../lib/api/fetch-pulse';
import { useAuth } from '../auth/auth-provider';
import { IntelSearch } from './intel-search';
import { MarketStrip } from './market-strip';
import { SignalDrawer } from './signal-drawer';
import { SignalRail } from './signal-rail';
import { WorldMap } from './world-map';

const TIME_WINDOWS = [
  { label: '24h', hours: 24 },
  { label: '72h', hours: 72 },
  { label: '7d', hours: 168 },
] as const;

const POLL_INTERVAL_MS = 60_000;

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function IntelligencePage() {
  const { user } = useAuth();
  const [windowHours, setWindowHours] = useState<number>(168);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<SignalSummaryV1 | null>(null);
  const [pulseData, setPulseData] = useState<PulseV1Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [newSignalCount, setNewSignalCount] = useState(0);
  const [freshnessText, setFreshnessText] = useState('');
  const prevTotalRef = useRef<number>(0);

  // Tick freshness display every 10s
  useEffect(() => {
    const tick = () => setFreshnessText(lastUpdated ? timeAgo(lastUpdated) : '');
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await fetchPulse(windowHours, selectedCountry ?? undefined);
        if (silent && prevTotalRef.current > 0 && data.totalSignals > prevTotalRef.current) {
          setNewSignalCount((prev) => prev + data.totalSignals - prevTotalRef.current);
        }
        prevTotalRef.current = data.totalSignals;
        setPulseData(data);
        setLastUpdated(data.generatedAt);
        setError(null);
      } catch (e) {
        if (!silent) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [windowHours, selectedCountry],
  );

  useEffect(() => {
    loadData();
    const id = setInterval(() => loadData(true), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadData]);

  const handleCountryClick = useCallback((iso2: string) => {
    setSelectedCountry((prev) => (prev === iso2 ? null : iso2));
    setSelectedSignal(null);
  }, []);

  const handleSignalClick = useCallback((signal: SignalSummaryV1) => {
    setSelectedSignal(signal);
  }, []);

  const handleFilterCountry = useCallback((iso2: string) => {
    setSelectedCountry(iso2);
    setSelectedSignal(null);
  }, []);

  const handleFilterEntity = useCallback(
    (entityType: string, entityId: string) => {
      const filtered = (pulseData?.allSignals ?? []).filter((s) =>
        s.primaryEntityRefs?.some((r) => r.entityType === entityType && r.entityId === entityId),
      );
      if (filtered.length > 0) {
        setSelectedSignal(null);
      }
    },
    [pulseData],
  );

  const handleSelectRelated = useCallback((signal: SignalSummaryV1) => {
    setSelectedSignal(signal);
  }, []);

  const handleSearchEntity = useCallback(
    (_entityType: string, _entityId: string) => {
      handleFilterEntity(_entityType, _entityId);
    },
    [handleFilterEntity],
  );

  const dismissNewSignals = useCallback(() => {
    setNewSignalCount(0);
  }, []);

  const displaySignals = pulseData?.allSignals ?? [];

  const relatedSignals = useMemo(() => {
    if (!selectedSignal) return [];
    return displaySignals
      .filter(
        (s) =>
          s.signalId !== selectedSignal.signalId &&
          (s.primaryCountryCode === selectedSignal.primaryCountryCode ||
            s.primaryEntityRefs?.some((r) =>
              selectedSignal.primaryEntityRefs?.some((sr) => sr.entityId === r.entityId),
            )),
      )
      .slice(0, 5);
  }, [selectedSignal, displaySignals]);

  return (
    <div className="intel-page">
      <header className="intel-header">
        <div className="intel-header__left">
          <h1 className="intel-header__brand">Signal</h1>
        </div>
        <div className="intel-header__center">
          <IntelSearch
            signals={displaySignals}
            onSelectSignal={handleSignalClick}
            onSelectCountry={handleCountryClick}
            onSelectEntity={handleSearchEntity}
          />
          <div className="intel-header__time-selector">
            {TIME_WINDOWS.map((tw) => (
              <button
                key={tw.hours}
                type="button"
                className={`intel-header__time-btn ${windowHours === tw.hours ? 'intel-header__time-btn--active' : ''}`}
                onClick={() => {
                  setWindowHours(tw.hours);
                  setSelectedCountry(null);
                  setSelectedSignal(null);
                }}
              >
                {tw.label}
              </button>
            ))}
          </div>
        </div>
        <div className="intel-header__right">
          {freshnessText && (
            <span className="intel-header__freshness" title={lastUpdated ?? undefined}>
              <span className="intel-header__live-dot" />
              {freshnessText}
            </span>
          )}
          {user ? (
            <a href="/settings" className="intel-header__user-link">
              {(user.displayName ?? user.email ?? 'U').charAt(0).toUpperCase()}
            </a>
          ) : (
            <a href="/auth" className="intel-header__auth-link">
              Sign in
            </a>
          )}
        </div>
      </header>

      <MarketStrip />

      {newSignalCount > 0 && (
        <button type="button" className="intel-new-signals" onClick={dismissNewSignals}>
          <span className="intel-new-signals__dot" />
          {newSignalCount} new signal{newSignalCount > 1 ? 's' : ''} available
        </button>
      )}

      {error && <div className="intel-error">{error}</div>}

      <div className="intel-body">
        <div
          className={`intel-body__map-area ${selectedSignal ? 'intel-body__map-area--narrow' : ''}`}
        >
          {loading && !pulseData ? (
            <div className="intel-loading">Loading intelligence data&hellip;</div>
          ) : (
            <WorldMap
              countries={pulseData?.countries ?? []}
              selectedCountry={selectedCountry}
              onCountryClick={handleCountryClick}
            />
          )}
        </div>

        <SignalRail
          signals={displaySignals}
          onSignalClick={handleSignalClick}
          selectedCountry={selectedCountry}
        />

        {selectedSignal && (
          <SignalDrawer
            signal={selectedSignal}
            relatedSignals={relatedSignals}
            onClose={() => setSelectedSignal(null)}
            onFilterCountry={handleFilterCountry}
            onFilterEntity={handleFilterEntity}
            onSelectRelated={handleSelectRelated}
            isAuthenticated={!!user}
            user={user}
          />
        )}
      </div>
    </div>
  );
}
