import 'server-only';

import type { UsMarketMorningSummary } from '@/lib/todayCandidatesContract';

const YAHOO_QUOTE_URL = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=';

type YahooQuoteResult = {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
};

export const US_MARKET_MORNING_ANCHORS = [
  { key: 'SPY', quoteSymbol: 'SPY', googleTicker: 'NYSEARCA:SPY', label: 'S&P500' },
  { key: 'QQQ', quoteSymbol: 'QQQ', googleTicker: 'NASDAQ:QQQ', label: 'Nasdaq 100' },
  { key: 'DIA', quoteSymbol: 'DIA', googleTicker: 'NYSEARCA:DIA', label: 'Dow' },
  { key: 'IWM', quoteSymbol: 'IWM', googleTicker: 'NYSEARCA:IWM', label: 'Russell 2000' },
  { key: 'SOXX', quoteSymbol: 'SOXX', googleTicker: 'NASDAQ:SOXX', label: 'Semiconductor' },
  { key: 'SMH', quoteSymbol: 'SMH', googleTicker: 'NASDAQ:SMH', label: 'Semiconductor ETF' },
  { key: 'XLK', quoteSymbol: 'XLK', googleTicker: 'NYSEARCA:XLK', label: 'Technology' },
  { key: 'XLF', quoteSymbol: 'XLF', googleTicker: 'NYSEARCA:XLF', label: 'Financials' },
  { key: 'TSLA', quoteSymbol: 'TSLA', googleTicker: 'NASDAQ:TSLA', label: 'Tesla' },
  { key: 'NVDA', quoteSymbol: 'NVDA', googleTicker: 'NASDAQ:NVDA', label: 'Nvidia' },
] as const;

async function fetchQuotes(symbols: string[]): Promise<Map<string, YahooQuoteResult>> {
  const endpoint = `${YAHOO_QUOTE_URL}${encodeURIComponent(symbols.join(','))}`;
  const res = await fetch(endpoint, { method: 'GET', next: { revalidate: 300 } });
  if (!res.ok) return new Map();
  const json = (await res.json()) as { quoteResponse?: { result?: YahooQuoteResult[] } };
  const rows = json.quoteResponse?.result ?? [];
  return new Map(rows.map((x) => [String(x.symbol ?? '').toUpperCase(), x]));
}

function pctChange(row?: YahooQuoteResult): number | null {
  const p = Number(row?.regularMarketPrice ?? NaN);
  const prev = Number(row?.regularMarketPreviousClose ?? NaN);
  if (!Number.isFinite(p) || !Number.isFinite(prev) || prev <= 0) return null;
  return ((p - prev) / prev) * 100;
}

export async function buildUsMarketMorningSummary(): Promise<UsMarketMorningSummary> {
  const asOfKst = new Date().toISOString();
  try {
    const symbols = US_MARKET_MORNING_ANCHORS.map((x) => x.quoteSymbol);
    const map = await fetchQuotes(symbols);
    if (map.size === 0) {
      return {
        asOfKst,
        available: false,
        conclusion: 'no_data',
        summary: '미국시장 데이터가 아직 충분하지 않습니다.',
        signals: [],
        warnings: ['us_market_quote_unavailable'],
      };
    }
    const spx = pctChange(map.get('SPY'));
    const ndx = pctChange(map.get('QQQ'));
    const soxx = pctChange(map.get('SOXX'));
    const positiveCount = [spx, ndx, soxx].filter((x) => (x ?? 0) > 0.6).length;
    const negativeCount = [spx, ndx, soxx].filter((x) => (x ?? 0) < -0.6).length;

    const signals: UsMarketMorningSummary['signals'] = [];
    if ((soxx ?? 0) > 1.0) {
      signals.push({ signalKey: 'us_semiconductor_strength', label: '미국 반도체 강세', direction: 'positive', confidence: 'medium', evidence: [`SOXX ${soxx?.toFixed(2)}%`] });
    }
    if ((spx ?? 0) < -0.8 || (ndx ?? 0) < -1.0) {
      signals.push({ signalKey: 'us_risk_off', label: '미국 리스크오프', direction: 'negative', confidence: 'medium', evidence: [`S&P500 ${spx?.toFixed(2)}%`, `NASDAQ ${ndx?.toFixed(2)}%`] });
    }
    if ((ndx ?? 0) > 0.7 && (soxx ?? 0) > 0.7) {
      signals.push({ signalKey: 'us_power_infra_strength', label: 'AI/전력 인프라 심리 개선', direction: 'positive', confidence: 'low', evidence: [`NASDAQ ${ndx?.toFixed(2)}%`, `SOXX ${soxx?.toFixed(2)}%`] });
    }

    const conclusion: UsMarketMorningSummary['conclusion'] =
      positiveCount >= 2 ? 'risk_on' : negativeCount >= 2 ? 'risk_off' : positiveCount === 1 && negativeCount === 1 ? 'mixed' : 'sector_rotation';

    return {
      asOfKst,
      available: true,
      conclusion,
      summary: `미국장은 ${conclusion} 흐름으로 관측됩니다. 한국장은 추격보다 확인 중심 접근이 필요합니다.`,
      signals,
      warnings: [],
    };
  } catch {
    return {
      asOfKst,
      available: false,
      conclusion: 'no_data',
      summary: '미국시장 데이터 조회에 실패해 제한적으로 표시합니다.',
      signals: [],
      warnings: ['us_market_quote_fetch_failed'],
    };
  }
}
