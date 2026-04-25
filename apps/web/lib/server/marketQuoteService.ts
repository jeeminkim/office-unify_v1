import 'server-only';
import {
  normalizeQuoteKey,
  isGoogleFinanceQuoteConfigured,
  readGoogleFinanceQuoteSheetRows,
  syncGoogleFinanceQuoteSheetRows,
} from '@/lib/server/googleFinanceSheetQuoteService';

type HoldingInput = {
  market: string;
  symbol: string;
  displayName?: string;
  quoteSymbol?: string;
  googleTicker?: string;
};

export type HoldingQuote = {
  market: string;
  symbol: string;
  currentPrice?: number;
  currency?: string;
  stale: boolean;
  sourceSymbol?: string;
  provider?: 'google_sheets_googlefinance' | 'yahoo' | 'none';
  delayed?: boolean;
  delayMinutes?: number;
};

export type QuoteProviderMeta = {
  providerUsed: 'google_sheets_googlefinance' | 'yahoo' | 'none';
  delayed: boolean;
  delayMinutes?: number;
  readBackSucceeded: boolean;
  refreshRequested?: boolean;
  missingSymbols: string[];
  warnings: string[];
  fxAvailable: boolean;
  fxProviderUsed: 'google_sheets_googlefinance' | 'yahoo' | 'none';
  quoteFallbackUsed: boolean;
};

export type QuoteBundle = {
  quoteByHolding: Map<string, HoldingQuote>;
  usdKrwRate?: number;
  warnings: string[];
  quoteAvailable: boolean;
  providerMeta: QuoteProviderMeta;
};

const YAHOO_QUOTE_URL = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=';
const STALE_MS = 24 * 60 * 60 * 1000;

type YahooQuoteResult = {
  symbol?: string;
  regularMarketPrice?: number;
  currency?: string;
  regularMarketTime?: number;
};

function holdingKey(market: string, symbol: string): string {
  return normalizeQuoteKey(market, symbol);
}

function isNumericKrCode(symbol: string): boolean {
  return /^\d{6}$/.test(symbol.trim());
}

function buildYahooCandidates(market: string, symbol: string): string[] {
  const upper = symbol.trim().toUpperCase();
  if (market === 'KR') {
    if (!isNumericKrCode(upper)) return [upper];
    return [`${upper}.KS`, `${upper}.KQ`, upper];
  }
  return [upper];
}

function buildYahooCandidatesForHolding(holding: HoldingInput): string[] {
  const override = holding.quoteSymbol?.trim().toUpperCase();
  if (override) return [override];
  return buildYahooCandidates(holding.market, holding.symbol);
}

async function fetchYahooQuotes(symbols: string[]): Promise<Map<string, YahooQuoteResult>> {
  if (symbols.length === 0) return new Map();
  const endpoint = `${YAHOO_QUOTE_URL}${encodeURIComponent(symbols.join(','))}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      signal: controller.signal,
      next: { revalidate: 120 },
    });
    if (!res.ok) return new Map();
    const json = (await res.json()) as { quoteResponse?: { result?: YahooQuoteResult[] } };
    const rows = json.quoteResponse?.result ?? [];
    return new Map(rows.map((row) => [String(row.symbol ?? '').toUpperCase(), row]));
  } catch {
    return new Map();
  } finally {
    clearTimeout(timeout);
  }
}

function computeMissingSymbols(holdings: HoldingInput[], map: Map<string, HoldingQuote>): string[] {
  return holdings
    .filter((holding) => !map.get(holdingKey(holding.market, holding.symbol))?.currentPrice)
    .map((holding) => `${holding.market}:${holding.symbol.toUpperCase()}`);
}

export async function loadHoldingQuotes(
  holdings: HoldingInput[],
  options?: { requestRefresh?: boolean },
): Promise<QuoteBundle> {
  const warnings: string[] = [];
  const quoteByHolding = new Map<string, HoldingQuote>();

  if (isGoogleFinanceQuoteConfigured()) {
    try {
      if (options?.requestRefresh) {
        await syncGoogleFinanceQuoteSheetRows(holdings);
      }
      const sheet = await readGoogleFinanceQuoteSheetRows();
      const sheetByKey = new Map(sheet.rows.map((row) => [normalizeQuoteKey(row.market, row.symbol), row]));
      holdings.forEach((holding) => {
        const key = holdingKey(holding.market, holding.symbol);
        const row = sheetByKey.get(key);
        quoteByHolding.set(key, {
          market: holding.market,
          symbol: holding.market === 'KR' ? holding.symbol.toUpperCase().padStart(6, '0') : holding.symbol.toUpperCase(),
          currentPrice: row?.price,
          currency: row?.currency,
          stale: !row?.price,
          provider: row?.price ? 'google_sheets_googlefinance' : 'none',
          delayed: row?.datadelay != null ? row.datadelay > 0 : true,
          delayMinutes: row?.datadelay,
        });
      });
      const matched = Array.from(quoteByHolding.values()).filter((row) => row.currentPrice != null).length;
      if (matched > 0) {
        const delayMinutes = Array.from(quoteByHolding.values())
          .map((row) => row.delayMinutes ?? 0)
          .filter((v) => Number.isFinite(v));
        const maxDelay = delayMinutes.length > 0 ? Math.max(...delayMinutes) : undefined;
        return {
          quoteByHolding,
          usdKrwRate: sheet.fxRate,
          warnings,
          quoteAvailable: true,
          providerMeta: {
            providerUsed: 'google_sheets_googlefinance',
            delayed: true,
            delayMinutes: maxDelay,
            readBackSucceeded: sheet.readBackSucceeded,
            refreshRequested: options?.requestRefresh === true,
            missingSymbols: computeMissingSymbols(holdings, quoteByHolding),
            warnings,
            fxAvailable: sheet.fxRate != null,
            fxProviderUsed: sheet.fxRate != null ? 'google_sheets_googlefinance' : 'none',
            quoteFallbackUsed: false,
          },
        };
      }
      warnings.push('googlefinance_readback_empty');
    } catch {
      warnings.push('googlefinance_readback_failed');
    }
  } else {
    warnings.push('googlefinance_not_configured');
  }

  const symbolCandidates = new Map<string, string[]>();
  holdings.forEach((holding) => {
    const key = holdingKey(holding.market, holding.symbol);
    symbolCandidates.set(key, buildYahooCandidatesForHolding(holding));
  });
  const yahooSymbols = Array.from(
    new Set([...symbolCandidates.values()].flat().concat(['KRW=X'])),
  );

  const quoteMap = await fetchYahooQuotes(yahooSymbols);
  if (quoteMap.size === 0) {
    warnings.push('quote_fetch_failed');
  }

  let matchedCount = 0;
  symbolCandidates.forEach((candidates, key) => {
    const [market, symbol] = key.split(':');
    const row = candidates.map((candidate) => quoteMap.get(candidate.toUpperCase())).find(Boolean);
    const price = Number(row?.regularMarketPrice ?? NaN);
    const marketTime = Number(row?.regularMarketTime ?? 0) * 1000;
    const stale = !marketTime || Date.now() - marketTime > STALE_MS;
    const valid = Number.isFinite(price) && price > 0;
    if (valid) matchedCount += 1;
    quoteByHolding.set(key, {
      market,
      symbol,
      currentPrice: valid ? price : undefined,
      currency: row?.currency,
      stale: valid ? stale : true,
      sourceSymbol: row?.symbol,
      provider: valid ? 'yahoo' : 'none',
      delayed: stale,
    });
  });

  const fx = quoteMap.get('KRW=X');
  const usdKrwRateRaw = Number(fx?.regularMarketPrice ?? NaN);
  const usdKrwRate = Number.isFinite(usdKrwRateRaw) && usdKrwRateRaw > 0 ? usdKrwRateRaw : undefined;
  if (!usdKrwRate) {
    warnings.push('usdkrw_rate_unavailable');
  }

  return {
    quoteByHolding,
    usdKrwRate,
    warnings,
    quoteAvailable: matchedCount > 0,
    providerMeta: {
      providerUsed: matchedCount > 0 ? 'yahoo' : 'none',
      delayed: true,
      readBackSucceeded: false,
      refreshRequested: options?.requestRefresh === true,
      missingSymbols: computeMissingSymbols(holdings, quoteByHolding),
      warnings,
      fxAvailable: usdKrwRate != null,
      fxProviderUsed: usdKrwRate != null ? 'yahoo' : 'none',
      quoteFallbackUsed: true,
    },
  };
}

