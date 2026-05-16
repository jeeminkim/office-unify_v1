import 'server-only';

import type { UsMarketMorningSummary } from '@/lib/todayCandidatesContract';

const YAHOO_QUOTE_URL = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=';

export const US_MARKET_SEED_ANCHORS = [
  { key: 'SPY', quoteSymbol: 'SPY', googleTicker: 'NYSEARCA:SPY', label: 'S&P500' },
  { key: 'QQQ', quoteSymbol: 'QQQ', googleTicker: 'NASDAQ:QQQ', label: 'Nasdaq 100' },
  { key: 'IWM', quoteSymbol: 'IWM', googleTicker: 'NYSEARCA:IWM', label: 'Russell 2000' },
  { key: 'SMH', quoteSymbol: 'SMH', googleTicker: 'NASDAQ:SMH', label: 'Semiconductor ETF' },
  { key: 'SOXX', quoteSymbol: 'SOXX', googleTicker: 'NASDAQ:SOXX', label: 'Semiconductor' },
  { key: 'XLV', quoteSymbol: 'XLV', googleTicker: 'NYSEARCA:XLV', label: 'Health Care' },
  { key: 'XLE', quoteSymbol: 'XLE', googleTicker: 'NYSEARCA:XLE', label: 'Energy' },
  { key: 'XLF', quoteSymbol: 'XLF', googleTicker: 'NYSEARCA:XLF', label: 'Financials' },
  { key: 'XLY', quoteSymbol: 'XLY', googleTicker: 'NYSEARCA:XLY', label: 'Consumer Disc.' },
  { key: 'XLP', quoteSymbol: 'XLP', googleTicker: 'NYSEARCA:XLP', label: 'Consumer Staples' },
  { key: 'XLI', quoteSymbol: 'XLI', googleTicker: 'NYSEARCA:XLI', label: 'Industrials' },
  { key: 'XLU', quoteSymbol: 'XLU', googleTicker: 'NYSEARCA:XLU', label: 'Utilities' },
  { key: 'DIA', quoteSymbol: 'DIA', googleTicker: 'NYSEARCA:DIA', label: 'Dow' },
  { key: 'XLK', quoteSymbol: 'XLK', googleTicker: 'NYSEARCA:XLK', label: 'Technology' },
  { key: 'TSLA', quoteSymbol: 'TSLA', googleTicker: 'NASDAQ:TSLA', label: 'Tesla' },
  { key: 'NVDA', quoteSymbol: 'NVDA', googleTicker: 'NASDAQ:NVDA', label: 'Nvidia' },
] as const;

/** @deprecated 이름 호환 — 동일 시드 사용 */
export const US_MARKET_MORNING_ANCHORS = US_MARKET_SEED_ANCHORS;

type YahooQuoteResult = {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
};

function uniqSymbols(symbols: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of symbols) {
    const u = s.trim().toUpperCase();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

async function fetchQuotes(
  symbols: string[],
  timeoutMs: number,
): Promise<{ map: Map<string, YahooQuoteResult>; upstreamStatus: number | null; fetchFailed: boolean }> {
  if (symbols.length === 0) return { map: new Map(), upstreamStatus: null, fetchFailed: false };
  const endpoint = `${YAHOO_QUOTE_URL}${encodeURIComponent(symbols.join(','))}`;
  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(Math.max(1000, timeoutMs)),
    });
    const upstreamStatus = res.status;
    if (!res.ok) return { map: new Map(), upstreamStatus, fetchFailed: true };
    const json = (await res.json()) as { quoteResponse?: { result?: YahooQuoteResult[] } };
    const rows = json.quoteResponse?.result ?? [];
    return {
      map: new Map(rows.map((x) => [String(x.symbol ?? '').toUpperCase(), x])),
      upstreamStatus,
      fetchFailed: false,
    };
  } catch {
    return { map: new Map(), upstreamStatus: null, fetchFailed: true };
  }
}

function pctChange(row?: YahooQuoteResult): number | null {
  const p = Number(row?.regularMarketPrice ?? NaN);
  const prev = Number(row?.regularMarketPreviousClose ?? NaN);
  if (!Number.isFinite(p) || !Number.isFinite(prev) || prev <= 0) return null;
  return ((p - prev) / prev) * 100;
}

function buildSignals(map: Map<string, YahooQuoteResult>): UsMarketMorningSummary['signals'] {
  const spx = pctChange(map.get('SPY'));
  const ndx = pctChange(map.get('QQQ'));
  const soxx = pctChange(map.get('SOXX')) ?? pctChange(map.get('SMH'));
  const signals: UsMarketMorningSummary['signals'] = [];
  if ((soxx ?? 0) > 1.0) {
    signals.push({
      signalKey: 'us_semiconductor_strength',
      label: '미국 반도체 강세',
      direction: 'positive',
      confidence: 'medium',
      evidence: [`반도체 ETF ${soxx?.toFixed(2)}%`],
    });
  }
  if ((spx ?? 0) < -0.8 || (ndx ?? 0) < -1.0) {
    signals.push({
      signalKey: 'us_risk_off',
      label: '미국 리스크오프',
      direction: 'negative',
      confidence: 'medium',
      evidence: [`S&P500 ${spx?.toFixed(2)}%`, `NASDAQ ${ndx?.toFixed(2)}%`],
    });
  }
  if ((ndx ?? 0) > 0.7 && (soxx ?? 0) > 0.7) {
    signals.push({
      signalKey: 'us_power_infra_strength',
      label: 'AI/전력 인프라 심리 개선',
      direction: 'positive',
      confidence: 'low',
      evidence: [`NASDAQ ${ndx?.toFixed(2)}%`, `반도체 ${soxx?.toFixed(2)}%`],
    });
  }
  const xlu = pctChange(map.get('XLU'));
  const xli = pctChange(map.get('XLI'));
  if ((xlu ?? 0) > 0.5 && (xli ?? 0) > 0.4) {
    signals.push({
      signalKey: 'us_power_infra_strength',
      label: '유틸·산업 인프라 상대 강세',
      direction: 'positive',
      confidence: 'low',
      evidence: [`XLU ${xlu?.toFixed(2)}%`, `XLI ${xli?.toFixed(2)}%`],
    });
  }
  return signals;
}

export async function buildUsMarketMorningSummary(opts?: {
  /** 추가 US 심볼(관심종목 등), Yahoo ticker */
  extraQuoteSymbols?: string[];
}): Promise<UsMarketMorningSummary> {
  const requestedAt = new Date().toISOString();
  const provider = 'yahoo_finance_quote_v7';
  const route = YAHOO_QUOTE_URL;
  const timeoutMs =
    Number(process.env.US_MARKET_QUOTE_TIMEOUT_MS ?? process.env.NEXT_PUBLIC_US_MARKET_QUOTE_TIMEOUT_MS ?? '') ||
    12000;
  const envMissing = false;

  const baseSyms = US_MARKET_SEED_ANCHORS.map((a) => a.quoteSymbol);
  const merged = uniqSymbols([...baseSyms, ...(opts?.extraQuoteSymbols ?? []).map((s) => s.replace(/^US:/i, ''))]);

  try {
    const { map, upstreamStatus, fetchFailed } = await fetchQuotes(merged, timeoutMs);
    const ratio = merged.length > 0 ? map.size / merged.length : 0;
    const coverageStatus = map.size === 0 || ratio < 0.35 ? 'degraded' : ratio < 0.75 ? 'degraded' : 'ok';
    const fallbackUsed = (opts?.extraQuoteSymbols?.length ?? 0) > 0;

    let emptyReason = 'ok';
    if (fetchFailed && map.size === 0) emptyReason = 'fetch_failed_or_non_ok';
    else if (!fetchFailed && map.size === 0) emptyReason = 'upstream_empty_result';
    else if (coverageStatus === 'degraded' && map.size > 0) emptyReason = 'partial_quote_set';

    const signals = buildSignals(map);
    const positiveCount = [pctChange(map.get('SPY')), pctChange(map.get('QQQ')), pctChange(map.get('SOXX'))].filter(
      (x) => (x ?? 0) > 0.6,
    ).length;
    const negativeCount = [pctChange(map.get('SPY')), pctChange(map.get('QQQ')), pctChange(map.get('SOXX'))].filter(
      (x) => (x ?? 0) < -0.6,
    ).length;

    let conclusion: UsMarketMorningSummary['conclusion'] =
      positiveCount >= 2 ? 'risk_on' : negativeCount >= 2 ? 'risk_off' : positiveCount === 1 && negativeCount === 1 ? 'mixed' : 'sector_rotation';

    const warnings: string[] = [];
    if (coverageStatus === 'degraded') warnings.push('us_market_coverage_degraded');
    if (fetchFailed) warnings.push('us_market_quote_fetch_failed');
    if (map.size === 0) warnings.push('us_market_quote_unavailable');

    let summary: string;
    if (map.size === 0) {
      conclusion = 'no_data';
      summary =
        '미국 ETF·지수 시세를 가져오지 못했습니다. 미국 신호 기반 한국 후보는 제한되며, 로컬 관찰·섹터 데이터 위주로 확인하세요.';
    } else if (coverageStatus === 'degraded') {
      summary = `미국 시세 일부만 확인되어 신호를 보수적으로 요약했습니다(${map.size}/${merged.length} 심볼). 확인 위주 관찰입니다.`;
    } else {
      summary = `미국장은 ${conclusion} 흐름으로 관측됩니다. 한국장은 추격보다 확인 중심 접근이 필요합니다.`;
    }

    const available = map.size > 0;

    return {
      asOfKst: requestedAt,
      available,
      conclusion,
      summary,
      signals,
      warnings,
      diagnostics: {
        yahooQuoteResultCount: map.size,
        anchorSymbolsRequested: merged.length,
        fetchFailed,
        representativeAnchors: US_MARKET_SEED_ANCHORS.slice(0, 8).map((a) => ({
          key: a.key,
          label: a.label,
          quoteSymbol: a.quoteSymbol,
        })),
        provider,
        route,
        requestedAt,
        upstreamStatus,
        emptyReason,
        envMissing: Boolean(envMissing),
        timeoutMs,
        fallbackUsed,
        coverageStatus,
        userWatchlistAnchorsMerged: opts?.extraQuoteSymbols?.length ?? 0,
      },
    };
  } catch {
    return {
      asOfKst: requestedAt,
      available: false,
      conclusion: 'no_data',
      summary: '미국시장 데이터 조회에 실패해 제한적으로 표시합니다.',
      signals: [],
      warnings: ['us_market_quote_fetch_failed'],
      diagnostics: {
        yahooQuoteResultCount: 0,
        anchorSymbolsRequested: merged.length,
        fetchFailed: true,
        representativeAnchors: US_MARKET_SEED_ANCHORS.slice(0, 8).map((a) => ({
          key: a.key,
          label: a.label,
          quoteSymbol: a.quoteSymbol,
        })),
        provider,
        route,
        requestedAt,
        upstreamStatus: null,
        emptyReason: 'exception',
        envMissing: Boolean(envMissing),
        timeoutMs,
        fallbackUsed: (opts?.extraQuoteSymbols?.length ?? 0) > 0,
        coverageStatus: 'degraded',
        userWatchlistAnchorsMerged: opts?.extraQuoteSymbols?.length ?? 0,
      },
    };
  }
}
