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

export type WatchlistResolveStatus = 'resolved' | 'ambiguous' | 'not_found' | 'degraded';
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
  code?: string;
  ticker?: string;
  googleTicker?: string;
  quoteSymbol?: string;
  sector?: string;
  theme?: string;
  themeKey?: string;
  matchReason?: string;
  source?: string;
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
  status: WatchlistResolveStatus;
  query: string;
  normalizedQuery: string;
  market: WatchlistResolveMarket;
  candidates: WatchlistResolveCandidate[];
  bestCandidate?: WatchlistResolveCandidate;
  selectedCandidate?: WatchlistResolveCandidate;
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
  theme?: string;
  source?: string;
};

type ExistingInstrument = {
  market: string;
  symbol: string;
  name: string;
  sector?: string | null;
  google_ticker?: string | null;
  quote_symbol?: string | null;
};

function kr(
  name: string,
  symbol: string,
  exchange: Extract<WatchlistResolveExchange, 'KOSPI' | 'KOSDAQ'>,
  aliases: string[] = [],
  sector?: string,
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
    sector,
    theme: sector,
  };
}

function us(
  name: string,
  symbol: string,
  exchange: Extract<WatchlistResolveExchange, 'NASDAQ' | 'NYSE' | 'NYSEARCA' | 'AMEX'>,
  aliases: string[] = [],
  sector?: string,
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
    sector,
    theme: sector,
  };
}

function manualSeed(name: string, aliases: string[], sector: string): KnownInstrument {
  return {
    name,
    aliases,
    market: 'ETF',
    exchange: 'UNKNOWN',
    symbol: 'UNKNOWN',
    googleTicker: '',
    quoteSymbol: '',
    sector,
    theme: sector,
    source: 'sector_radar_seed',
  };
}

const KNOWN_KR: KnownInstrument[] = [
  kr('삼성전자', '005930', 'KOSPI', ['삼전', 'samsung electronics'], '반도체'),
  kr('SK하이닉스', '000660', 'KOSPI', ['하이닉스', 'sk hynix'], '반도체'),
  kr('한화오션', '042660', 'KOSPI', ['hanwha ocean'], '조선'),
  kr('HLB', '028300', 'KOSDAQ', ['에이치엘비'], '바이오'),
  kr('롯데케미칼', '011170', 'KOSPI', ['lotte chemical'], '화학'),
  kr('고려아연', '010130', 'KOSPI', ['korea zinc'], '비철금속'),
  kr('일진전기', '103590', 'KOSPI', ['iljin electric'], '전력기기'),
  kr('LS', '006260', 'KOSPI', ['ls corp'], '전력기기'),
  kr('현대차', '005380', 'KOSPI', ['현대자동차', 'hyundai motor', 'hyundai motors'], '자동차'),
  kr('기아', '000270', 'KOSPI', ['kia', 'kia motors'], '자동차'),
  kr('NAVER', '035420', 'KOSPI', ['네이버', 'naver corp'], '인터넷/플랫폼'),
  kr('LG에너지솔루션', '373220', 'KOSPI', ['lg energy solution', 'lg엔솔'], '2차전지'),
  kr('LG전자', '066570', 'KOSPI', ['lg electronics'], '전자/가전'),
  kr('고영', '098460', 'KOSDAQ', ['koh young', 'koh young technology'], '반도체/검사장비'),
  kr('리가켐바이오', '141080', 'KOSDAQ', ['legochem biosciences', '레고켐바이오'], '바이오'),
  kr('HL만도', '204320', 'KOSPI', ['에이치엘만도', 'hl mando', 'mando'], '자동차부품'),
  kr('파마리서치', '214450', 'KOSDAQ', ['pharmaresearch'], '바이오'),
  kr('메지온', '140410', 'KOSDAQ', ['mezzion'], '바이오'),
  kr('알테오젠', '196170', 'KOSDAQ', ['alteogen'], '바이오'),
  kr('삼성전기', '009150', 'KOSPI', ['samsung electro-mechanics'], '전자부품'),
  manualSeed('LG CNS', ['lg cns', '엘지씨엔에스'], 'IT 서비스'),
  manualSeed('RISE 현대차그룹피지컬AI ETF', ['rise 현대차그룹피지컬ai etf', '현대차그룹피지컬ai', 'physical ai etf', 'rise physical ai'], '자동차/로봇/AI'),
  manualSeed('RISE 현대차고정피지컬AI ETF', ['rise 현대차고정피지컬ai etf', '현대차고정피지컬ai', 'physical ai etf'], '로봇/AI 인프라'),
  manualSeed('TIGER 코리아AI전력기기TOP3플러스', ['tiger 코리아ai전력기기 top3플러스', '코리아ai전력기기', 'ai전력기기 top3'], '전력기기/AI 인프라'),
  manualSeed('KODEX AI반도체핵심장비', ['kodex ai반도체핵심장비', 'ai반도체핵심장비', '반도체핵심장비 etf'], '반도체 장비'),
];

const KNOWN_US: KnownInstrument[] = [
  us('Tesla', 'TSLA', 'NASDAQ', ['테슬라', 'tesla inc'], '전기차'),
  us('NVIDIA', 'NVDA', 'NASDAQ', ['엔비디아', 'nvidia corporation'], 'AI 반도체'),
  us('Apple', 'AAPL', 'NASDAQ', ['애플'], '빅테크'),
  us('Microsoft', 'MSFT', 'NASDAQ', ['마이크로소프트'], '빅테크/AI 인프라'),
  us('Netflix', 'NFLX', 'NASDAQ', ['넷플릭스'], '콘텐츠/미디어'),
  us('Amazon', 'AMZN', 'NASDAQ', ['아마존', 'amazon.com'], '빅테크/커머스'),
  us('ServiceNow', 'NOW', 'NYSE', ['서비스나우'], '소프트웨어'),
  us('Palantir', 'PLTR', 'NYSE', ['팔란티어', 'palantir technologies'], 'AI/데이터'),
  us('Coinbase', 'COIN', 'NASDAQ', ['코인베이스'], '디지털자산 인프라'),
  us('SPDR S&P 500 ETF', 'SPY', 'NYSEARCA', ['spy', 's&p 500 etf'], '미국 지수', 'ETF'),
  us('Invesco QQQ Trust', 'QQQ', 'NASDAQ', ['qqq', 'nasdaq 100 etf'], '미국 지수', 'ETF'),
  us('VanEck Semiconductor ETF', 'SMH', 'NASDAQ', ['smh', 'semiconductor etf'], '반도체', 'ETF'),
];

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
  return /^[0-9A-Z]+$/.test(raw) && /\d/.test(raw) && !/^\d{6}$/.test(raw);
}

function toCandidate(
  item: KnownInstrument,
  matchType: WatchlistResolveMatchType,
  confidence: WatchlistResolveConfidence,
  source: string,
  label: string,
): WatchlistResolveCandidate {
  const manual = item.symbol === 'UNKNOWN';
  return {
    symbol: item.symbol,
    name: item.name,
    resolvedName: item.name,
    market: item.market,
    exchange: item.exchange,
    stockCode: item.market === 'KR' ? item.symbol : undefined,
    code: item.market === 'KR' ? item.symbol : undefined,
    ticker: item.market !== 'KR' && !manual ? item.symbol : undefined,
    googleTicker: item.googleTicker,
    quoteSymbol: item.quoteSymbol,
    sector: item.sector,
    theme: item.theme ?? item.sector,
    matchReason: manual
      ? '이름은 인식했지만 종목코드/ticker 확인이 필요합니다.'
      : '이름 또는 ticker가 resolver registry와 일치했습니다.',
    source,
    confidence,
    matchType,
    sourceRefs: [{ source, label }],
    warnings: manual ? ['manual_ticker_mapping_required', 'no_auto_watchlist_registration'] : undefined,
    actionHint: manual
      ? '등록 후보입니다. 정확한 6자리 코드 또는 ticker를 확인한 뒤 사용자가 명시 버튼으로만 등록하세요.'
      : '등록 후보입니다. 폼 채우기는 local state만 바꾸며, 관심종목 추가는 사용자가 명시 버튼을 눌렀을 때만 진행됩니다.',
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
      code: symbol,
      googleTicker: item.google_ticker?.trim() || diagnosis.googleTicker || `KRX:${symbol}`,
      quoteSymbol: item.quote_symbol?.trim() || diagnosis.quoteSymbol || `${symbol}.KS`,
      sector: item.sector ?? undefined,
      theme: item.sector ?? undefined,
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
      theme: item.sector ?? undefined,
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

function confidenceRank(confidence: WatchlistResolveConfidence): number {
  if (confidence === 'high') return 3;
  if (confidence === 'medium') return 2;
  return 1;
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
    if (item.symbol === 'UNKNOWN' && (exactName || partialName)) {
      candidates.push(toCandidate(item, 'manual_review', 'low', item.source ?? 'sector_radar_seed', 'ETF name seed'));
    } else if (isKrStockCode(ticker) && item.market === 'KR' && item.symbol === ticker) {
      candidates.push(toCandidate(item, 'stock_code_exact', 'high', 'known_registry', '내장 종목 코드 매칭'));
    } else if (exactTicker && item.market !== 'KR') {
      candidates.push(toCandidate(item, 'ticker_exact', 'high', 'known_registry', '내장 ticker 매칭'));
    } else if (exactName) {
      candidates.push(toCandidate(item, 'exact_name', 'high', 'known_registry', '내장 종목명 매칭'));
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
  const singleHigh = highConfidence.length === 1;
  let ambiguityStatus: WatchlistResolveAmbiguityStatus = 'not_found';
  if (singleHigh) ambiguityStatus = 'single_high_confidence';
  else if (candidates.length > 1) ambiguityStatus = 'multiple_candidates';
  else if (candidates.length === 1) ambiguityStatus = 'needs_manual_review';
  else if (input.failureCode !== 'name_not_found') ambiguityStatus = 'needs_manual_review';
  const status: WatchlistResolveStatus = input.ok
    ? 'resolved'
    : ambiguityStatus === 'multiple_candidates'
      ? 'ambiguous'
      : candidates.length > 0
        ? 'degraded'
        : 'not_found';
  const market = bestCandidate?.market ?? 'UNKNOWN';

  return {
    ok: input.ok,
    status,
    query: input.query,
    normalizedQuery,
    market,
    candidates,
    bestCandidate,
    selectedCandidate: input.ok ? bestCandidate : undefined,
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
      actionHint: '한국 종목코드는 6자리 숫자여야 합니다. 종목명을 다시 입력하거나 정확한 6자리 코드를 확인하세요.',
      invalidInputReason: 'invalid_symbol',
    });
  }

  const candidates = matchKnownInstrument(query, marketHint, input.holdings, input.watchlist);
  const highConfidence = candidates.filter((candidate) => candidate.confidence === 'high');
  if (highConfidence.length === 1) {
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
