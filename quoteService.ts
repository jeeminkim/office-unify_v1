import { logger } from './logger';

export type QuoteRequest = {
  symbol: string;
  quoteSymbol: string | null;
  market: 'KR' | 'US';
  currency: 'KRW' | 'USD';
  displayName?: string | null;
  /** KOSPI / KOSDAQ 등 — KR 후보 순서 및 장외 종가 우선에 사용 */
  exchange?: string | null;
};

export type QuotePriceSource =
  | 'live_usd'
  | 'live_krw'
  | 'eod_usd'
  | 'eod_krw'
  | 'fallback_usd'
  | 'fallback_krw'
  | 'snapshot_krw'
  | 'purchase_basis_krw';

/** 사용자/문서용 가격 출처 구분 */
export type PriceSourceKind = 'live' | 'delayed' | 'eod' | 'cache' | 'fallback';

export type QuoteResult = {
  price: number | null;
  currency: string;
  degraded: boolean;
  failedCandidates: number;
  finalSource?: 'live' | 'cache' | 'fallback' | 'eod';
  priceSource?: QuotePriceSource;
  failureBreakdown?: QuoteFailureBreakdown;
  attempts?: QuoteAttemptMeta[];
  traceId?: string;
  resolved_quote_symbol?: string | null;
  price_source_kind?: PriceSourceKind;
  price_asof?: string | null;
  market_state?: 'open' | 'closed' | 'unknown';
  fallback_reason?: string | null;
};

export type QuoteFailureReason =
  | 'unauthorized_401'
  | 'forbidden_403'
  | 'not_found_404'
  | 'rate_limited_429'
  | 'server_error_5xx'
  | 'timeout'
  | 'network_error'
  | 'unknown_error';

export type QuoteFailureBreakdown = {
  unauthorized401?: number;
  forbidden403?: number;
  notFound404?: number;
  rateLimited429?: number;
  serverError5xx?: number;
  timeout?: number;
  networkError?: number;
  unknownError?: number;
};

export type QuoteAttemptMeta = {
  candidate: string;
  status?: number;
  classifiedReason: QuoteFailureReason | 'ok';
  latencyMs?: number;
  success: boolean;
};

type QuoteCacheValue = {
  price: number;
  currency: string;
  fetchedAtMs: number;
};

const quoteCache = new Map<string, QuoteCacheValue>();
const QUOTE_TTL_MS = 60 * 1000;

function newQuoteTraceId(symbol: string): string {
  const s = (symbol || 'UNKNOWN').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'UNKNOWN';
  const t = Date.now().toString(36).slice(-6);
  const r = Math.random().toString(36).slice(2, 6);
  return `q-${s}-${t}-${r}`;
}

function safeUrlSummary(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}?symbols=${u.searchParams.get('symbols') || ''}`;
  } catch {
    return 'invalid_url';
  }
}

function classifyByStatus(status?: number): QuoteFailureReason {
  if (status === 401) return 'unauthorized_401';
  if (status === 403) return 'forbidden_403';
  if (status === 404) return 'not_found_404';
  if (status === 429) return 'rate_limited_429';
  if (typeof status === 'number' && status >= 500) return 'server_error_5xx';
  return 'unknown_error';
}

export function classifyQuoteError(error?: any, status?: number): QuoteFailureReason {
  if (typeof status === 'number') return classifyByStatus(status);
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  if (name.includes('abort') || message.includes('timeout') || message.includes('timed out')) return 'timeout';
  if (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('enotfound') ||
    message.includes('econnrefused')
  ) {
    return 'network_error';
  }
  return 'unknown_error';
}

function addFailureBreakdown(target: QuoteFailureBreakdown, reason: QuoteFailureReason): void {
  if (reason === 'unauthorized_401') target.unauthorized401 = (target.unauthorized401 || 0) + 1;
  else if (reason === 'forbidden_403') target.forbidden403 = (target.forbidden403 || 0) + 1;
  else if (reason === 'not_found_404') target.notFound404 = (target.notFound404 || 0) + 1;
  else if (reason === 'rate_limited_429') target.rateLimited429 = (target.rateLimited429 || 0) + 1;
  else if (reason === 'server_error_5xx') target.serverError5xx = (target.serverError5xx || 0) + 1;
  else if (reason === 'timeout') target.timeout = (target.timeout || 0) + 1;
  else if (reason === 'network_error') target.networkError = (target.networkError || 0) + 1;
  else target.unknownError = (target.unknownError || 0) + 1;
}

export function mergeFailureBreakdown(list: QuoteFailureBreakdown[]): QuoteFailureBreakdown {
  const out: QuoteFailureBreakdown = {};
  for (const b of list) {
    out.unauthorized401 = (out.unauthorized401 || 0) + (b.unauthorized401 || 0);
    out.forbidden403 = (out.forbidden403 || 0) + (b.forbidden403 || 0);
    out.notFound404 = (out.notFound404 || 0) + (b.notFound404 || 0);
    out.rateLimited429 = (out.rateLimited429 || 0) + (b.rateLimited429 || 0);
    out.serverError5xx = (out.serverError5xx || 0) + (b.serverError5xx || 0);
    out.timeout = (out.timeout || 0) + (b.timeout || 0);
    out.networkError = (out.networkError || 0) + (b.networkError || 0);
    out.unknownError = (out.unknownError || 0) + (b.unknownError || 0);
  }
  return out;
}

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

/** KOSPI/KOSDAQ 힌트로 .KS / .KQ 후보 순서 조정 */
export function orderKrCandidates(candidates: string[], exchange: string | null | undefined): string[] {
  const ex = String(exchange || '').toUpperCase();
  const uniq = Array.from(new Set(candidates));
  const kq = uniq.filter(c => /\.KQ$/i.test(c));
  const ks = uniq.filter(c => /\.KS$/i.test(c));
  const rest = uniq.filter(c => !/\.(KS|KQ)$/i.test(c));
  if (ex.includes('KOSDAQ')) return [...kq, ...ks, ...rest];
  if (ex.includes('KOSPI')) return [...ks, ...kq, ...rest];
  return uniq;
}

/** KST 기준 한국장 개장 여부(단순: 평일 09:00–15:30, 공휴일 미구분) */
export function getKrMarketSession(): 'open' | 'closed' {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = fmt.formatToParts(new Date());
  const wd = parts.find(p => p.type === 'weekday')?.value || '';
  if (wd === 'Sat' || wd === 'Sun') return 'closed';
  let h = 0;
  let m = 0;
  for (const p of parts) {
    if (p.type === 'hour') h = parseInt(p.value, 10) || 0;
    if (p.type === 'minute') m = parseInt(p.value, 10) || 0;
  }
  const mins = h * 60 + m;
  if (mins >= 9 * 60 && mins <= 15 * 60 + 30) return 'open';
  return 'closed';
}

async function fetchYahooChartLastDailyClose(
  yahooSymbol: string
): Promise<{ price: number; currency: string; tsSec: number } | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=5d&interval=1d`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json: any = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return null;
  const closes = result?.indicators?.quote?.[0]?.close as number[] | undefined;
  const times = (result?.timestamp || []) as number[];
  if (!closes?.length) return null;
  for (let i = closes.length - 1; i >= 0; i--) {
    const c = Number(closes[i]);
    if (Number.isFinite(c) && c > 0) {
      const cur = String(result?.meta?.currency || '').toUpperCase() || 'USD';
      const tsSec = times[i] || result?.meta?.regularMarketTime || 0;
      return { price: c, currency: cur, tsSec: typeof tsSec === 'number' ? tsSec : 0 };
    }
  }
  return null;
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

function normSym(s: string | null | undefined): string {
  return String(s || '')
    .trim()
    .toUpperCase();
}

export async function getLatestQuote(
  req: QuoteRequest,
  fallbackPrice?: number | null,
  fallbackCurrency?: string,
  fallbackPriceSource?: QuotePriceSource
): Promise<QuoteResult> {
  const { symbol, quoteSymbol, market, exchange } = req;
  const rawCandidates = buildCandidates(symbol, quoteSymbol, market);
  const candidates = market === 'KR' ? orderKrCandidates(rawCandidates, exchange) : rawCandidates;
  const traceId = newQuoteTraceId(symbol);
  const startedAtMs = Date.now();
  const now = Date.now();
  const krSession = market === 'KR' ? getKrMarketSession() : 'unknown';

  logger.info('QUOTE', 'quote request started', {
    traceId,
    symbol,
    originalSymbol: symbol,
    quoteSymbol,
    exchange: exchange || null,
    market,
    candidateTickers: candidates,
    candidateCount: candidates.length
  });

  let failedCandidates = 0;
  const attempts: QuoteAttemptMeta[] = [];
  const failureBreakdown: QuoteFailureBreakdown = {};

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const cacheKey = `${market}:${candidate}`;
    const cached = quoteCache.get(cacheKey);
    if (cached && now - cached.fetchedAtMs < QUOTE_TTL_MS) {
      logger.info('QUOTE', 'quote candidate succeeded', {
        traceId,
        originalSymbol: symbol,
        candidateIndex: i,
        candidate,
        source: 'cache',
        cacheHit: true,
        status: null,
        statusText: null,
        latencyMs: 0
      });
      if (normSym(quoteSymbol) && normSym(candidate) !== normSym(quoteSymbol)) {
        logger.info('QUOTE_RESOLUTION', 'symbol_corrected', {
          traceId,
          stored: quoteSymbol,
          resolved: candidate,
          via: 'cache'
        });
      }
      const result: QuoteResult = {
        price: cached.price,
        currency: cached.currency,
        degraded: false,
        failedCandidates,
        finalSource: 'cache',
        priceSource: cached.currency === 'KRW' ? 'live_krw' : 'live_usd',
        failureBreakdown,
        attempts,
        traceId,
        resolved_quote_symbol: candidate,
        price_source_kind: 'cache',
        price_asof: new Date(cached.fetchedAtMs).toISOString(),
        market_state: krSession === 'unknown' ? 'unknown' : krSession,
        fallback_reason: null
      };
      logger.info('QUOTE', 'quote request completed', {
        traceId,
        originalSymbol: symbol,
        candidateCount: candidates.length,
        attemptedCount: attempts.length,
        failedCount: failedCandidates,
        failureBreakdown,
        cacheHit: true,
        fallbackUsed: false,
        degraded: false,
        finalPrice: result.price,
        finalCurrency: result.currency,
        totalLatencyMs: Date.now() - startedAtMs,
        finalSource: result.finalSource
      });
      return result;
    }

    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(candidate)}`;
    const requestStarted = Date.now();
    try {
      const fetched = await fetchYahooPrice(candidate);
      if (fetched) {
        quoteCache.set(cacheKey, { ...fetched, fetchedAtMs: now });
        const latencyMs = Date.now() - requestStarted;
        attempts.push({ candidate, status: 200, classifiedReason: 'ok', latencyMs, success: true });
        logger.info('QUOTE', 'quote candidate succeeded', {
          traceId,
          originalSymbol: symbol,
          candidateIndex: i,
          candidate,
          requestUrlSummary: safeUrlSummary(url),
          method: 'GET',
          status: 200,
          statusText: 'OK',
          latencyMs,
          cacheHit: false,
          headerSummary: {
            hasUserAgent: false,
            hasCookie: false,
            hasAuthorization: false
          },
          credentialHint: {
            crumbUsed: false,
            cookieUsed: false,
            tokenUsed: false
          }
        });
        if (normSym(quoteSymbol) && normSym(candidate) !== normSym(quoteSymbol)) {
          logger.info('QUOTE_RESOLUTION', 'symbol_corrected', {
            traceId,
            stored: quoteSymbol,
            resolved: candidate,
            via: 'yahoo_quote'
          });
        }
        logger.info('QUOTE_RESOLUTION', 'current_success', {
          traceId,
          symbol,
          candidate,
          market,
          krSession
        });
        const result: QuoteResult = {
          ...fetched,
          degraded: false,
          failedCandidates,
          finalSource: 'live',
          priceSource: fetched.currency === 'KRW' ? 'live_krw' : 'live_usd',
          failureBreakdown,
          attempts,
          traceId,
          resolved_quote_symbol: candidate,
          price_source_kind: 'live',
          price_asof: new Date().toISOString(),
          market_state: krSession === 'unknown' ? 'unknown' : krSession,
          fallback_reason: null
        };
        logger.info('QUOTE', 'quote request completed', {
          traceId,
          originalSymbol: symbol,
          candidateCount: candidates.length,
          attemptedCount: attempts.length,
          failedCount: failedCandidates,
          failureBreakdown,
          cacheHit: false,
          fallbackUsed: false,
          degraded: false,
          finalPrice: result.price,
          finalCurrency: result.currency,
          totalLatencyMs: Date.now() - startedAtMs,
          finalSource: result.finalSource
        });
        return result;
      }
    } catch (error: any) {
      const latencyMs = Date.now() - requestStarted;
      const statusMatch = String(error?.message || '').match(/HTTP\s+(\d+)/i);
      const status = statusMatch ? Number(statusMatch[1]) : undefined;
      const classifiedReason = classifyQuoteError(error, status);
      const retryable =
        classifiedReason === 'rate_limited_429' ||
        classifiedReason === 'server_error_5xx' ||
        classifiedReason === 'timeout' ||
        classifiedReason === 'network_error';
      attempts.push({
        candidate,
        status,
        classifiedReason,
        latencyMs,
        success: false
      });
      addFailureBreakdown(failureBreakdown, classifiedReason);
      logger.warn('QUOTE', 'quote candidate failed', {
        traceId,
        originalSymbol: symbol,
        quoteSymbol,
        market,
        displayName: req.displayName || null,
        candidateIndex: i,
        candidate,
        requestUrlSummary: safeUrlSummary(url),
        method: 'GET',
        status: status ?? null,
        statusText: status ? `HTTP_${status}` : null,
        classifiedReason,
        latencyMs,
        timeout: classifiedReason === 'timeout',
        retryable,
        headerSummary: {
          hasUserAgent: false,
          hasCookie: false,
          hasAuthorization: false
        },
        credentialHint: {
          crumbUsed: false,
          cookieUsed: false,
          tokenUsed: false
        },
        errorClass: error?.name || 'Error',
        errorMessage: error?.message || String(error)
      });
      failedCandidates += 1;
    }
  }

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const cacheKey = `${market}:${candidate}`;
    try {
      const eod = await fetchYahooChartLastDailyClose(candidate);
      if (eod && Number.isFinite(eod.price) && eod.price > 0) {
        quoteCache.set(cacheKey, { price: eod.price, currency: eod.currency, fetchedAtMs: now });
        attempts.push({
          candidate,
          status: 200,
          classifiedReason: 'ok',
          latencyMs: 0,
          success: true
        });
        if (normSym(quoteSymbol) && normSym(candidate) !== normSym(quoteSymbol)) {
          logger.info('QUOTE_RESOLUTION', 'symbol_corrected', {
            traceId,
            stored: quoteSymbol,
            resolved: candidate,
            via: 'yahoo_chart_eod'
          });
        }
        logger.info('QUOTE_RESOLUTION', 'eod_fallback_used', {
          traceId,
          symbol,
          candidate,
          tsSec: eod.tsSec,
          krSession
        });
        const asof =
          eod.tsSec > 0 ? new Date(eod.tsSec * 1000).toISOString() : new Date().toISOString();
        const ps: QuotePriceSource = eod.currency === 'KRW' ? 'eod_krw' : 'eod_usd';
        return {
          price: eod.price,
          currency: eod.currency,
          degraded: false,
          failedCandidates,
          finalSource: 'eod',
          priceSource: ps,
          failureBreakdown,
          attempts,
          traceId,
          resolved_quote_symbol: candidate,
          price_source_kind: 'eod',
          price_asof: asof,
          market_state: krSession === 'unknown' ? 'unknown' : krSession,
          fallback_reason: 'yahoo_chart_1d'
        };
      }
    } catch {
      failedCandidates += 1;
    }
  }

  const fallback = Number(fallbackPrice);
  if (Number.isFinite(fallback) && fallback > 0) {
    const fc = (fallbackCurrency || (market === 'US' ? 'USD' : 'KRW')).toUpperCase();
    const result: QuoteResult = {
      price: fallback,
      currency: fc,
      degraded: true,
      failedCandidates,
      finalSource: 'fallback',
      priceSource:
        fallbackPriceSource || (fc === 'KRW' ? 'fallback_krw' : 'fallback_usd'),
      failureBreakdown,
      attempts,
      traceId,
      resolved_quote_symbol: normSym(quoteSymbol) || symbol,
      price_source_kind: 'fallback',
      price_asof: null,
      market_state: krSession === 'unknown' ? 'unknown' : krSession,
      fallback_reason: 'portfolio_row_snapshot'
    };
    logger.info('QUOTE_RESOLUTION', 'cache_fallback_used', {
      traceId,
      symbol,
      kind: 'db_snapshot_row',
      price: result.price
    });
    logger.warn('QUOTE', 'quote request fallback used', {
      traceId,
      originalSymbol: symbol,
      fallbackPrice: result.price,
      fallbackCurrency: result.currency
    });
    logger.warn('QUOTE', 'quote request degraded', {
      traceId,
      originalSymbol: symbol,
      candidateCount: candidates.length,
      attemptedCount: attempts.length,
      failedCount: failedCandidates,
      failureBreakdown,
      cacheHit: false,
      fallbackUsed: true,
      degraded: true,
      finalPrice: result.price,
      finalCurrency: result.currency,
      totalLatencyMs: Date.now() - startedAtMs,
      finalSource: result.finalSource
    });
    return result;
  }
  const result: QuoteResult = {
    price: null,
    currency: (fallbackCurrency || (market === 'US' ? 'USD' : 'KRW')).toUpperCase(),
    degraded: true,
    failedCandidates,
    finalSource: 'fallback',
    priceSource: fallbackPriceSource || (((fallbackCurrency || '').toUpperCase() === 'KRW' ? 'fallback_krw' : 'fallback_usd')),
    failureBreakdown,
    attempts,
    traceId,
    resolved_quote_symbol: normSym(quoteSymbol) || symbol,
    price_source_kind: 'fallback',
    price_asof: null,
    market_state: krSession === 'unknown' ? 'unknown' : krSession,
    fallback_reason: 'all_sources_failed'
  };
  logger.warn('QUOTE', 'quote request degraded', {
    traceId,
    originalSymbol: symbol,
    candidateCount: candidates.length,
    attemptedCount: attempts.length,
    failedCount: failedCandidates,
    failureBreakdown,
    cacheHit: false,
    fallbackUsed: true,
    degraded: true,
    finalPrice: null,
    finalCurrency: result.currency,
    totalLatencyMs: Date.now() - startedAtMs,
    finalSource: result.finalSource
  });
  return result;
}

