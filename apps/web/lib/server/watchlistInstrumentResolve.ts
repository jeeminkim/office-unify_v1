import 'server-only';

import { normalizeKoreanGoogleTicker, normalizeUsGoogleTicker } from '@/lib/server/quotePipelineDiagnostics';

export type WatchlistResolveFailureCode =
  | 'name_not_found'
  | 'ambiguous_name'
  | 'ticker_resolver_timeout'
  | 'googlefinance_pending'
  | 'quote_symbol_unknown'
  | 'symbol_or_name_required'
  | 'invalid_symbol';

export type WatchlistResolveMarket = 'KR' | 'US' | 'ETF' | 'UNKNOWN';
export type WatchlistResolveExchange = 'KOSPI' | 'KOSDAQ' | 'NASDAQ' | 'NYSE' | 'NYSEARCA' | 'AMEX' | 'UNKNOWN';
export type WatchlistResolveConfidence = 'high' | 'medium' | 'low';
export type WatchlistResolveMatchType =
  | 'exact_name'
  | 'alias_name'
  | 'ticker_exact'
  | 'stock_code_exact'
  | 'normalized_name'
  | 'registry_match'
  | 'existing_holding'
  | 'existing_watchlist'
  | 'sector_radar_seed'
  | 'manual_review';

export type WatchlistResolveCandidate = {
  symbol: string;
  name: string;
  resolvedName: string;
  market: WatchlistResolveMarket;
  exchange?: WatchlistResolveExchange;
  stockCode?: string;
  ticker?: string;
  googleTicker?: string;
  quoteSymbol?: string;
  sector?: string;
  themeKey?: string;
  confidence: WatchlistResolveConfidence;
  matchType: WatchlistResolveMatchType;
  sourceRefs: Array<{
    source: string;
    label: string;
  }>;
  warnings?: string[];
  actionHint?: string;
};

export type WatchlistResolveAmbiguityStatus =
  | 'single_high_confidence'
  | 'multiple_candidates'
  | 'needs_manual_review'
  | 'not_found';

export type WatchlistResolveResult = {
  ok: boolean;
  query: string;
  normalizedQuery: string;
  candidates: WatchlistResolveCandidate[];
  bestCandidate?: WatchlistResolveCandidate;
  resolved?: WatchlistResolveCandidate;
  ambiguityStatus: WatchlistResolveAmbiguityStatus;
  canAutoFillForm: boolean;
  writeAction: false;
  failureCode?: WatchlistResolveFailureCode;
  actionHint?: string;
  qualityMeta: {
    resolver: {
      sourceCounts: Record<string, number>;
      confidenceCounts: Record<WatchlistResolveConfidence, number>;
      invalidInputReason?: string;
      noResultReason?: string;
    };
  };
};

type KnownInstrument = {
  name: string;
  aliases: string[];
  market: WatchlistResolveMarket;
  exchange: WatchlistResolveExchange;
  symbol: string;
  googleTicker: string;
  quoteSymbol: string;
  sector?: string;
};

type ExistingInstrument = {
  market: string;
  symbol: string;
  name: string;
  sector?: string | null;
  google_ticker?: string | null;
  quote_symbol?: string | null;
};

const KNOWN_KR: KnownInstrument[] = [
  kr('삼성전자', '005930', 'KOSPI', ['삼전', 'samsung electronics']),
  kr('SK하이닉스', '000660', 'KOSPI', ['하이닉스', 'sk hynix']),
  kr('한화오션', '042660', 'KOSPI', ['hanwha ocean']),
  kr('HLB', '028300', 'KOSDAQ', ['에이치엘비']),
  kr('롯데케미칼', '011170', 'KOSPI', ['lotte chemical']),
  kr('고려아연', '010130', 'KOSPI', ['korea zinc']),
  kr('일진전기', '103590', 'KOSPI', ['iljin electric']),
  kr('LS', '006260', 'KOSPI', ['ls corp']),
  kr('파마리서치', '214450', 'KOSDAQ', ['pharmaresearch']),
  kr('메지온', '140410', 'KOSDAQ', ['mezzion']),
  kr('알테오젠', '196170', 'KOSDAQ', ['alteogen']),
  kr('삼성전기', '009150', 'KOSPI', ['samsung electro-mechanics']),
];

const KNOWN_US: KnownInstrument[] = [
  us('Tesla', 'TSLA', 'NASDAQ', ['테슬라']),
  us('NVIDIA', 'NVDA', 'NASDAQ', ['엔비디아', 'nvidia corporation']),
  us('Apple', 'AAPL', 'NASDAQ', ['애플']),
  us('Microsoft', 'MSFT', 'NASDAQ', ['마이크로소프트']),
  us('Netflix', 'NFLX', 'NASDAQ', ['넷플릭스']),
  us('ServiceNow', 'NOW', 'NYSE', ['서비스나우']),
  us('Coinbase', 'COIN', 'NASDAQ', ['코인베이스']),
  us('SPDR S&P 500 ETF', 'SPY', 'NYSEARCA', ['spy', 's&p 500 etf'], 'ETF'),
  us('Invesco QQQ Trust', 'QQQ', 'NASDAQ', ['qqq', 'nasdaq 100 etf'], 'ETF'),
  us('VanEck Semiconductor ETF', 'SMH', 'NASDAQ', ['smh', 'semiconductor etf'], 'ETF'),
];

function kr(
  name: string,
  symbol: string,
  exchange: Extract<WatchlistResolveExchange, 'KOSPI' | 'KOSDAQ'>,
  aliases: string[] = [],
): KnownInstrument {
  const diagnosis = normalizeKoreanGoogleTicker(symbol, exchange);
  return {
    name,
    aliases,
    market: 'KR',
    exchange,
    symbol,
    googleTicker: diagnosis.googleTicker ?? (exchange === 'KOSDAQ' ? `KOSDAQ:${symbol}` : `KRX:${symbol}`),
    quoteSymbol: diagnosis.quoteSymbol ?? (exchange === 'KOSDAQ' ? `${symbol}.KQ` : `${symbol}.KS`),
  };
}

function us(
  name: string,
  symbol: string,
  exchange: Extract<WatchlistResolveExchange, 'NASDAQ' | 'NYSE' | 'NYSEARCA' | 'AMEX'>,
  aliases: string[] = [],
  market: WatchlistResolveMarket = 'US',
): KnownInstrument {
  const diagnosis = normalizeUsGoogleTicker(symbol);
  return {
    name,
    aliases,
    market,
    exchange,
    symbol,
    googleTicker:
      diagnosis.googleTicker && diagnosis.googleTicker.includes(':') ? diagnosis.googleTicker : `${exchange}:${symbol}`,
    quoteSymbol: diagnosis.quoteSymbol ?? symbol,
  };
}

function normalizeQuery(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[()[\]{}·.,'"]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function normalizeTicker(input: string): string {
  return input.trim().normalize('NFKC').toUpperCase();
}

function isKrStockCode(input: string): boolean {
  return /^\d{6}$/.test(input.trim());
}

function isInvalidKrLikeSymbol(input: string): boolean {
  const raw = input.trim().toUpperCase();
  return /\d/.test(raw) && !/^\d{6}$/.test(raw);
}

function toCandidate(
  item: KnownInstrument,
  matchType: WatchlistResolveMatchType,
  confidence: WatchlistResolveConfidence,
  source: string,
  label: string,
): WatchlistResolveCandidate {
  return {
    symbol: item.symbol,
    name: item.name,
    resolvedName: item.name,
    market: item.market,
    exchange: item.exchange,
    stockCode: item.market === 'KR' ? item.symbol : undefined,
    ticker: item.market !== 'KR' ? item.symbol : undefined,
    googleTicker: item.googleTicker,
    quoteSymbol: item.quoteSymbol,
    sector: item.sector,
    confidence,
    matchType,
    sourceRefs: [{ source, label }],
    actionHint: '등록 후보입니다. 관심종목 추가는 사용자가 확인 버튼을 눌렀을 때만 진행됩니다.',
  };
}

function toExistingCandidate(
  item: ExistingInstrument,
  source: 'existing_holding' | 'existing_watchlist',
): WatchlistResolveCandidate | null {
  const market = item.market.trim().toUpperCase();
  const symbol = normalizeTicker(item.symbol);
  const name = item.name.trim() || symbol;
  if (!symbol) return null;
  if (market === 'KR') {
    if (!isKrStockCode(symbol)) return null;
    const diagnosis = normalizeKoreanGoogleTicker(symbol, null);
    return {
      symbol,
      name,
      resolvedName: name,
      market: 'KR',
      exchange: 'UNKNOWN',
      stockCode: symbol,
      googleTicker: item.google_ticker?.trim() || diagnosis.googleTicker || `KRX:${symbol}`,
      quoteSymbol: item.quote_symbol?.trim() || diagnosis.quoteSymbol || `${symbol}.KS`,
      sector: item.sector ?? undefined,
      confidence: 'high',
      matchType: source,
      sourceRefs: [{ source, label: source === 'existing_holding' ? '기존 보유 종목' : '기존 관심종목' }],
      warnings: ['KOSPI/KOSDAQ 구분은 기존 데이터 기준으로 확인하세요.'],
      actionHint: '이미 등록된 데이터에서 찾은 후보입니다. 저장은 명시 버튼에서만 진행됩니다.',
    };
  }
  if (market === 'US') {
    const diagnosis = normalizeUsGoogleTicker(symbol);
    if (diagnosis.status !== 'ok') return null;
    return {
      symbol,
      name,
      resolvedName: name,
      market: 'US',
      exchange: 'UNKNOWN',
      ticker: symbol,
      googleTicker: item.google_ticker?.trim() || diagnosis.googleTicker || symbol,
      quoteSymbol: item.quote_symbol?.trim() || diagnosis.quoteSymbol || symbol,
      sector: item.sector ?? undefined,
      confidence: 'high',
      matchType: source,
      sourceRefs: [{ source, label: source === 'existing_holding' ? '기존 보유 종목' : '기존 관심종목' }],
      actionHint: '이미 등록된 데이터에서 찾은 후보입니다. 저장은 명시 버튼에서만 진행됩니다.',
    };
  }
  return null;
}

function candidateKey(c: WatchlistResolveCandidate): string {
  return `${c.market}:${c.symbol}:${c.googleTicker ?? ''}`;
}

function dedupeCandidates(candidates: WatchlistResolveCandidate[]): WatchlistResolveCandidate[] {
  const byKey = new Map<string, WatchlistResolveCandidate>();
  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }
    byKey.set(key, {
      ...existing,
      confidence: confidenceRank(candidate.confidence) > confidenceRank(existing.confidence) ? candidate.confidence : existing.confidence,
      sourceRefs: mergeSourceRefs(existing.sourceRefs, candidate.sourceRefs),
      warnings: Array.from(new Set([...(existing.warnings ?? []), ...(candidate.warnings ?? [])])),
    });
  }
  return Array.from(byKey.values()).slice(0, 10);
}

function mergeSourceRefs(
  left: WatchlistResolveCandidate['sourceRefs'],
  right: WatchlistResolveCandidate['sourceRefs'],
): WatchlistResolveCandidate['sourceRefs'] {
  const key = (ref: { source: string; label: string }) => `${ref.source}:${ref.label}`;
  const map = new Map(left.map((ref) => [key(ref), ref]));
  for (const ref of right) map.set(key(ref), ref);
  return Array.from(map.values());
}

function confidenceRank(confidence: WatchlistResolveConfidence): number {
  if (confidence === 'high') return 3;
  if (confidence === 'medium') return 2;
  return 1;
}

function matchKnownInstrument(
  query: string,
  marketHint: 'KR' | 'US' | 'AUTO',
  holdings: ExistingInstrument[],
  watchlist: ExistingInstrument[],
): WatchlistResolveCandidate[] {
  const normalized = normalizeQuery(query);
  const ticker = normalizeTicker(query);
  const candidates: WatchlistResolveCandidate[] = [];

  for (const item of [...holdings, ...watchlist]) {
    const source = holdings.includes(item) ? 'existing_holding' : 'existing_watchlist';
    const candidate = toExistingCandidate(item, source);
    if (!candidate) continue;
    const nameKey = normalizeQuery(candidate.name);
    const symbolKey = normalizeTicker(candidate.symbol);
    if (nameKey === normalized || symbolKey === ticker) candidates.push(candidate);
  }

  const known = marketHint === 'KR' ? KNOWN_KR : marketHint === 'US' ? KNOWN_US : [...KNOWN_KR, ...KNOWN_US];
  for (const item of known) {
    const names = [item.name, ...item.aliases];
    const exactName = names.some((name) => normalizeQuery(name) === normalized);
    const exactTicker = normalizeTicker(item.symbol) === ticker;
    const partialName = normalized.length >= 2 && names.some((name) => normalizeQuery(name).includes(normalized));
    if (isKrStockCode(ticker) && item.market === 'KR' && item.symbol === ticker) {
      candidates.push(toCandidate(item, 'stock_code_exact', 'high', 'known_registry', '내장 종목 코드 맵'));
    } else if (exactTicker && item.market !== 'KR') {
      candidates.push(toCandidate(item, 'ticker_exact', 'high', 'known_registry', '내장 ticker 맵'));
    } else if (exactName) {
      candidates.push(toCandidate(item, 'exact_name', 'high', 'known_registry', '내장 종목명 맵'));
    } else if (partialName) {
      candidates.push(toCandidate(item, 'normalized_name', 'medium', 'known_registry', '정규화 이름 검색'));
    }
  }

  return dedupeCandidates(candidates).sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence));
}

function buildQualityMeta(candidates: WatchlistResolveCandidate[], invalidInputReason?: string, noResultReason?: string) {
  const sourceCounts: Record<string, number> = {};
  const confidenceCounts: Record<WatchlistResolveConfidence, number> = { high: 0, medium: 0, low: 0 };
  for (const candidate of candidates) {
    confidenceCounts[candidate.confidence] += 1;
    for (const ref of candidate.sourceRefs) sourceCounts[ref.source] = (sourceCounts[ref.source] ?? 0) + 1;
  }
  return {
    resolver: {
      sourceCounts,
      confidenceCounts,
      invalidInputReason,
      noResultReason,
    },
  };
}

function result(input: {
  ok: boolean;
  query: string;
  candidates: WatchlistResolveCandidate[];
  failureCode?: WatchlistResolveFailureCode;
  actionHint?: string;
  invalidInputReason?: string;
  noResultReason?: string;
}): WatchlistResolveResult {
  const normalizedQuery = normalizeQuery(input.query);
  const candidates = dedupeCandidates(input.candidates);
  const highConfidence = candidates.filter((candidate) => candidate.confidence === 'high');
  const bestCandidate = highConfidence[0] ?? candidates[0];
  const singleHigh = highConfidence.length === 1 && candidates.length === 1;
  let ambiguityStatus: WatchlistResolveAmbiguityStatus = 'not_found';
  if (singleHigh) ambiguityStatus = 'single_high_confidence';
  else if (candidates.length > 1) ambiguityStatus = 'multiple_candidates';
  else if (candidates.length === 1) ambiguityStatus = 'needs_manual_review';
  else if (input.failureCode !== 'name_not_found') ambiguityStatus = 'needs_manual_review';

  return {
    ok: input.ok,
    query: input.query,
    normalizedQuery,
    candidates,
    bestCandidate,
    resolved: input.ok ? bestCandidate : undefined,
    ambiguityStatus,
    canAutoFillForm: singleHigh,
    writeAction: false,
    failureCode: input.failureCode,
    actionHint: input.actionHint,
    qualityMeta: buildQualityMeta(candidates, input.invalidInputReason, input.noResultReason),
  };
}

export function resolveWatchlistInstrument(input: {
  market?: 'KR' | 'US' | 'AUTO';
  marketHint?: 'KR' | 'US' | 'AUTO';
  query?: string;
  symbol?: string;
  name?: string;
  holdings: ExistingInstrument[];
  watchlist: ExistingInstrument[];
}): WatchlistResolveResult {
  const marketHint = input.marketHint ?? input.market ?? 'AUTO';
  const query = (input.query ?? input.name ?? input.symbol ?? '').trim();
  if (!query) {
    return result({
      ok: false,
      query,
      candidates: [],
      failureCode: 'symbol_or_name_required',
      actionHint: '종목명, 6자리 국내 종목코드, 또는 미국 ticker를 입력하세요.',
      invalidInputReason: 'empty_query',
    });
  }

  if ((marketHint === 'KR' || marketHint === 'AUTO') && isInvalidKrLikeSymbol(query)) {
    return result({
      ok: false,
      query,
      candidates: [],
      failureCode: 'invalid_symbol',
      actionHint: '한국 종목코드는 6자리 숫자여야 합니다. 종목명을 다시 입력하거나 직접 6자리 코드를 확인하세요.',
      invalidInputReason: 'invalid_symbol',
    });
  }

  const candidates = matchKnownInstrument(query, marketHint, input.holdings, input.watchlist);
  const highConfidence = candidates.filter((candidate) => candidate.confidence === 'high');
  if (highConfidence.length === 1 && candidates.length === 1) {
    return result({ ok: true, query, candidates });
  }
  if (candidates.length > 1) {
    return result({
      ok: false,
      query,
      candidates,
      failureCode: 'ambiguous_name',
      actionHint: '가까운 등록 후보가 여러 개입니다. 목록에서 정확한 종목을 선택하세요.',
    });
  }
  if (candidates.length === 1) {
    return result({
      ok: false,
      query,
      candidates,
      failureCode: 'quote_symbol_unknown',
      actionHint: '후보를 찾았지만 신뢰도가 충분하지 않습니다. 코드와 Google ticker를 확인한 뒤 채우세요.',
    });
  }

  return result({
    ok: false,
    query,
    candidates: [],
    failureCode: 'name_not_found',
    actionHint: '등록 후보를 찾지 못했습니다. 한국 종목은 6자리 코드, 미국 종목은 ticker를 직접 입력하세요.',
    noResultReason: 'no_registry_match',
  });
}
