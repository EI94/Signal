import type { ApiRuntimeConfig } from '@signal/config';
import type { MarketCard, MarketStripV1Response } from '@signal/contracts';
import type { FastifyPluginAsync } from 'fastify';

const MARKET_TTL_SECONDS = 300;

type InstrumentDef = {
  symbol: string;
  label: string;
  currency: string;
};

const INSTRUMENTS: InstrumentDef[] = [
  { symbol: 'BZ=F', label: 'Brent', currency: 'USD' },
  { symbol: 'CL=F', label: 'WTI', currency: 'USD' },
  { symbol: 'TTF=F', label: 'TTF Gas', currency: 'EUR' },
  { symbol: 'NG=F', label: 'Henry Hub', currency: 'USD' },
  { symbol: 'CFI2Z4.DE', label: 'EUA Carbon', currency: 'EUR' },
  { symbol: 'EURUSD=X', label: 'EUR/USD', currency: '' },
];

let cachedResponse: MarketStripV1Response | null = null;
let cachedAt = 0;

async function fetchSingleQuote(def: InstrumentDef): Promise<MarketCard> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(def.symbol)}?range=2d&interval=1d`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      chart?: { result?: { meta?: Record<string, number> }[] };
    };
    const meta = json?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    const prevClose = meta?.chartPreviousClose ?? meta?.previousClose;
    if (price != null && prevClose != null) {
      const d = price - prevClose;
      const pct = ((d / prevClose) * 100).toFixed(2);
      return {
        symbol: def.symbol,
        label: def.label,
        value: price,
        previousClose: prevClose,
        delta: `${d >= 0 ? '+' : ''}${pct}%`,
        direction: d > 0 ? 'up' : d < 0 ? 'down' : 'flat',
        currency: def.currency || null,
        updatedAt: new Date().toISOString(),
        stale: false,
      };
    }
  } catch {
    // fall through
  }
  return {
    symbol: def.symbol,
    label: def.label,
    value: null,
    previousClose: null,
    delta: null,
    direction: null,
    currency: def.currency || null,
    updatedAt: null,
    stale: true,
  };
}

async function getMarketStrip(): Promise<MarketStripV1Response> {
  const now = Date.now();
  if (cachedResponse && now - cachedAt < MARKET_TTL_SECONDS * 1000) {
    return cachedResponse;
  }
  const cards = await Promise.all(INSTRUMENTS.map(fetchSingleQuote));
  const response: MarketStripV1Response = {
    generatedAt: new Date().toISOString(),
    ttlSeconds: MARKET_TTL_SECONDS,
    cards,
  };
  cachedResponse = response;
  cachedAt = now;
  return response;
}

export const marketV1Routes: FastifyPluginAsync<{
  config: ApiRuntimeConfig;
}> = async (app) => {
  app.get('/market', async () => {
    return getMarketStrip();
  });
};
