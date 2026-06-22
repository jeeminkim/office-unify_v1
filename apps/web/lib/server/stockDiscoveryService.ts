import 'server-only';
import {
  fetchTossAssetSnapshot,
  fetchTossDailyCandles,
  fetchTossMarketData,
  fetchTossStockInfo,
  fetchTossStockWarnings,
  type TossCandle,
  type TossStockInfo,
} from '@/lib/server/tossMarketDataService';

type InstrumentInput = {
  market: string;
  symbol: string;
  name: string;
  sector?: string | null;
};

export type StockDiscoveryItem = {
  symbol: string;
  name: string;
  englishName?: string;
  market: 'KR' | 'US';
  exchange: string;
  currency: string;
  securityType: string;
  currentPrice?: number;
  updatedAt?: string;
  isHeld: boolean;
  isWatchlisted: boolean;
  exactMatch?: boolean;
  analysis?: {
    score: number;
    signal: 'momentum' | 'pullback' | 'recovery' | 'neutral' | 'risk';
    signalLabel: string;
    return5d?: number;
    return20d?: number;
    distanceFrom20dHigh?: number;
    warningTypes: string[];
    reasons: string[];
  };
};

const DISCOVERY_SEEDS = [
  '005930', '000660', '035420', '035720', '005380', '373220', '207940', '068270',
  '105560', '055550', '069500', '229200',
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO', 'AMD', 'QQQ', 'SPY',
];
const CACHE_MS = 5 * 60 * 1000;
const candleCache = new Map<string, { expiresAt: number; candles: TossCandle[] }>();
const warningCache = new Map<string, { expiresAt: number; warningTypes: string[] }>();

function normalizeSymbol(market: string, symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (market === 'KR' && /^\d+$/.test(normalized)) return normalized.padStart(6, '0');
  return normalized;
}

function normalizeName(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '').trim().toLowerCase();
}

function marketFromInfo(info: TossStockInfo): 'KR' | 'US' {
  return info.currency === 'KRW' || info.market.startsWith('KO') || info.market === 'KR_ETC' ? 'KR' : 'US';
}

function percentChange(current: number, previous: number | undefined): number | undefined {
  if (!previous || previous <= 0) return undefined;
  return ((current - previous) / previous) * 100;
}

async function cachedCandles(symbol: string): Promise<TossCandle[]> {
  const cached = candleCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) return cached.candles;
  const candles = await fetchTossDailyCandles(symbol, 30);
  candleCache.set(symbol, { expiresAt: Date.now() + CACHE_MS, candles });
  return candles;
}

async function cachedWarnings(symbol: string): Promise<string[]> {
  const cached = warningCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) return cached.warningTypes;
  const rows = await fetchTossStockWarnings(symbol).catch(() => []);
  const warningTypes = rows.map((row) => row.warningType);
  warningCache.set(symbol, { expiresAt: Date.now() + CACHE_MS, warningTypes });
  return warningTypes;
}

function analyzeCandles(candles: TossCandle[], warningTypes: string[]) {
  const closes = candles
    .map((candle) => ({ timestamp: Date.parse(candle.timestamp), close: Number(candle.closePrice) }))
    .filter((row) => Number.isFinite(row.timestamp) && Number.isFinite(row.close) && row.close > 0)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((row) => row.close);
  const current = closes.at(-1);
  if (!current) {
    return {
      score: warningTypes.length > 0 ? 10 : 40,
      signal: warningTypes.length > 0 ? 'risk' as const : 'neutral' as const,
      signalLabel: warningTypes.length > 0 ? '주의 필요' : '데이터 확인 중',
      warningTypes,
      reasons: ['일봉 데이터가 충분하지 않아 가격 흐름 점수는 보수적으로 표시합니다.'],
    };
  }
  const return5d = percentChange(current, closes.at(-6));
  const return20d = percentChange(current, closes.at(-21));
  const window20 = closes.slice(-20);
  const high20 = Math.max(...window20);
  const distanceFrom20dHigh = high20 > 0 ? ((current - high20) / high20) * 100 : undefined;
  let score = 50 + (return5d ?? 0) * 1.8 + (return20d ?? 0) * 0.55;
  let signal: 'momentum' | 'pullback' | 'recovery' | 'neutral' | 'risk' = 'neutral';
  let signalLabel = '중립 흐름';
  const reasons: string[] = [];

  if (warningTypes.length > 0) {
    signal = 'risk';
    signalLabel = '투자 유의';
    score = Math.min(score, 25);
    reasons.push(`토스증권 투자 유의사항 ${warningTypes.length}건이 확인됩니다.`);
  } else if ((return5d ?? 0) >= 2 && (return20d ?? 0) >= 4) {
    signal = 'momentum';
    signalLabel = '상승 흐름';
    reasons.push('5일과 20일 흐름이 함께 우상향하고 있습니다.');
  } else if ((return5d ?? 0) <= -2 && (return20d ?? 0) > 0) {
    signal = 'pullback';
    signalLabel = '상승 후 조정';
    reasons.push('20일 흐름은 양호하지만 최근 5일은 조정 구간입니다.');
  } else if ((return5d ?? 0) > 0 && (return20d ?? 0) < 0) {
    signal = 'recovery';
    signalLabel = '반등 관찰';
    reasons.push('중기 흐름은 약하지만 최근 5일 반등이 나타났습니다.');
  } else {
    reasons.push('단기·중기 흐름이 한 방향으로 뚜렷하지 않습니다.');
  }
  if (distanceFrom20dHigh != null) {
    reasons.push(`20일 고점 대비 ${Math.abs(distanceFrom20dHigh).toFixed(1)}% 낮은 위치입니다.`);
  }
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    signal,
    signalLabel,
    return5d,
    return20d,
    distanceFrom20dHigh,
    warningTypes,
    reasons,
  };
}

export async function buildStockDiscovery(input: {
  query?: string;
  holdings: InstrumentInput[];
  watchlist: InstrumentInput[];
}): Promise<{ generatedAt: string; query: string; exactMatch?: StockDiscoveryItem; matches: StockDiscoveryItem[]; recommendations: StockDiscoveryItem[] }> {
  const tossHoldings = await fetchTossAssetSnapshot().then((snapshot) => snapshot.holdings.items).catch(() => []);
  const holdingRows: InstrumentInput[] = [
    ...input.holdings,
    ...tossHoldings.map((row) => ({ market: row.marketCountry, symbol: row.symbol, name: row.name })),
  ];
  const holdingSymbols = new Set(holdingRows.map((row) => normalizeSymbol(row.market, row.symbol)));
  const watchSymbols = new Set(input.watchlist.map((row) => normalizeSymbol(row.market, row.symbol)));
  const symbols = Array.from(new Set([
    ...DISCOVERY_SEEDS,
    ...holdingSymbols,
    ...watchSymbols,
  ])).filter(Boolean);

  const [infoMap, marketData] = await Promise.all([
    fetchTossStockInfo(symbols),
    fetchTossMarketData(symbols),
  ]);
  const baseItems: StockDiscoveryItem[] = Array.from(infoMap.values())
    .filter((info) => info.status === 'ACTIVE')
    .map((info) => {
      const symbol = info.symbol.trim().toUpperCase();
      const quote = marketData.prices.get(symbol);
      return {
        symbol,
        name: info.name,
        englishName: info.englishName,
        market: marketFromInfo(info),
        exchange: info.market,
        currency: info.currency,
        securityType: info.securityType,
        currentPrice: quote?.price,
        updatedAt: quote?.timestamp,
        isHeld: holdingSymbols.has(symbol),
        isWatchlisted: watchSymbols.has(symbol),
      };
    });

  const query = (input.query ?? '').trim();
  const nameQuery = normalizeName(query);
  const symbolQuery = query.toUpperCase();
  const exact = query
    ? baseItems.filter((item) => item.symbol === symbolQuery || normalizeName(item.name) === nameQuery || normalizeName(item.englishName ?? '') === nameQuery)
    : [];
  const partial = query && exact.length === 0
    ? baseItems.filter((item) => normalizeName(item.name).includes(nameQuery) || normalizeName(item.englishName ?? '').includes(nameQuery)).slice(0, 8)
    : [];
  const matches = (exact.length > 0 ? exact : partial).map((item) => ({ ...item, exactMatch: exact.includes(item) }));

  const recommendationPool = baseItems
    .filter((item) => !item.isHeld)
    .sort((a, b) => Number(b.isWatchlisted) - Number(a.isWatchlisted))
    .slice(0, 5);
  const analysisSymbols = Array.from(new Set([
    ...matches.slice(0, 2).map((item) => item.symbol),
    ...recommendationPool.map((item) => item.symbol),
  ])).slice(0, 5);
  const analyses = new Map<string, StockDiscoveryItem['analysis']>();
  await Promise.all(analysisSymbols.map(async (symbol) => {
    const [candles, warningTypes] = await Promise.all([cachedCandles(symbol), cachedWarnings(symbol)]);
    analyses.set(symbol, analyzeCandles(candles, warningTypes));
  }));

  const withAnalysis = (item: StockDiscoveryItem): StockDiscoveryItem => ({ ...item, analysis: analyses.get(item.symbol) });
  const enrichedMatches = matches.map(withAnalysis);
  const recommendations = recommendationPool
    .map(withAnalysis)
    .sort((a, b) => (b.analysis?.score ?? 0) - (a.analysis?.score ?? 0));
  return {
    generatedAt: new Date().toISOString(),
    query,
    exactMatch: enrichedMatches.find((item) => item.exactMatch),
    matches: enrichedMatches,
    recommendations,
  };
}
