'use client';

import type { MarketStripV1Response } from '@signal/contracts';
import { useCallback, useEffect, useState } from 'react';
import { getSignalApiBaseUrl } from '../../lib/api/signal-api';

async function fetchMarketStrip(): Promise<MarketStripV1Response> {
  const base = getSignalApiBaseUrl();
  if (!base) throw new Error('API base not configured');
  const res = await fetch(`${base}/v1/market`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as MarketStripV1Response;
}

export function MarketStrip() {
  const [data, setData] = useState<MarketStripV1Response | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await fetchMarketStrip());
    } catch {
      // keep existing
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  const cards = data?.cards ?? [];

  return (
    <section className="market-strip" aria-label="Market context">
      {cards.length === 0 &&
        ['Brent', 'WTI', 'TTF Gas', 'Henry Hub', 'EUA Carbon', 'EUR/USD'].map((label) => (
          <div key={label} className="market-strip__card">
            <span className="market-strip__label">{label}</span>
            <span className="market-strip__unavailable">&mdash;</span>
          </div>
        ))}
      {cards.map((card) => (
        <div
          key={card.symbol}
          className={`market-strip__card ${card.stale ? 'market-strip__card--stale' : ''}`}
        >
          <span className="market-strip__label">{card.label}</span>
          {card.value != null ? (
            <>
              <span className="market-strip__value">
                {card.value.toFixed(card.label === 'EUR/USD' ? 4 : 2)}
              </span>
              {card.delta && (
                <span
                  className={`market-strip__delta market-strip__delta--${card.direction ?? 'flat'}`}
                >
                  {card.delta}
                </span>
              )}
            </>
          ) : (
            <span className="market-strip__unavailable">&mdash;</span>
          )}
        </div>
      ))}
    </section>
  );
}
