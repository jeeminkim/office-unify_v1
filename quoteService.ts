import { logger } from './logger';

export type QuoteRequest = {
  symbol: string;
  quoteSymbol: string | null;
  market: 'KR' | 'US';
  currency: 'KRW' | 'USD';
  displayName?: string | null;
};

type QuoteResult = {
  price: number | null;
  currency: string;
};

type QuoteCacheValue = {
  price: number;
  currency: string;
  fetchedAtMs: number;
};

const quoteCache = new Map<string, QuoteCacheValue>();
const QUOTE_TTL_MS = 60 * 1000;

function buildCandidates(symbol: string, quoteSymbol: string | null, market: string): string[] {
  const normalized = (symbol || '').trim().toUpperCase();
  const normalizedQuote = (quoteSymbol || '').trim().toUpperCase();
  const candidates: string[] = [];
  if (normalizedQuote) candidates.push(normalizedQuote);
  if (market === 'US') {
    candidates.push(normalized);
    return Array.from(new Set(candidates));
  }
  if (market === 'KR') {
    if (/^\d{6}$/.test(normalized)) {
      candidates.push(`${normalized}.KS`, `${normalized}.KQ`);
      return Array.from(new Set(candidates));
    }
    candidates.push(normalized, `${normalized}.KS`, `${normalized}.KQ`);
    return Array.from(new Set(candidates));
  }
  candidates.push(normalized);
  return Array.from(new Set(candidates));
}

async function fetchYahooPrice(yahooSymbol: string): Promise<{ price: number; currency: string } | null> {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json: any = await res.json();
  const item = json?.quoteResponse?.result?.[0];
  const price = Number(item?.regularMarketPrice);
  const currency = String(item?.currency || '').toUpperCase();
  if (!Number.isFinite(price) || price <= 0) return null;
  return { price, currency: currency || 'USD' };
}

export async function getLatestQuote(req: QuoteRequest, fallbackPrice?: number | null, fallbackCurrency?: string): Promise<QuoteResult> {
  const { symbol, quoteSymbol, market } = req;
  const candidates = buildCandidates(symbol, quoteSymbol, market);
  const now = Date.now();
  logger.info('QUOTE', 'quote fetch using normalized symbol', {
    symbol,
    quoteSymbol,
    market
  });

  for (const candidate of candidates) {
    const cacheKey = `${market}:${candidate}`;
    const cached = quoteCache.get(cacheKey);
    if (cached && now - cached.fetchedAtMs < QUOTE_TTL_MS) {
      logger.info('QUOTE', 'latest quote fetched', { symbol, market, price: cached.price, currency: cached.currency });
      return { price: cached.price, currency: cached.currency };
    }

    try {
      const fetched = await fetchYahooPrice(candidate);
      if (fetched) {
        quoteCache.set(cacheKey, { ...fetched, fetchedAtMs: now });
        logger.info('QUOTE', 'latest quote fetched', { symbol, market, price: fetched.price, currency: fetched.currency });
        return fetched;
      }
    } catch (error: any) {
      logger.error('QUOTE', 'quote fetch failed', {
        symbol,
        quoteSymbol,
        market,
        displayName: req.displayName || null,
        error: error?.message || String(error)
      });
    }
  }

  const fallback = Number(fallbackPrice);
  if (Number.isFinite(fallback) && fallback > 0) {
    return { price: fallback, currency: (fallbackCurrency || (market === 'US' ? 'USD' : 'KRW')).toUpperCase() };
  }
  return { price: null, currency: (fallbackCurrency || (market === 'US' ? 'USD' : 'KRW')).toUpperCase() };
}

