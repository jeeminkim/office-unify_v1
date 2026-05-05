import type { WebPortfolioWatchlistRow } from '@office-unify/supabase-access';

export type WatchlistSectorMatchStatus =
  | 'matched_known_map'
  | 'matched_keyword'
  | 'matched_ticker_type'
  | 'matched_existing_sector'
  | 'needs_review'
  | 'no_match';

export interface WatchlistSectorMatchInput {
  id?: string;
  symbol?: string;
  name: string;
  market?: 'KR' | 'US' | 'JP' | 'UNKNOWN';
  rawTicker?: string;
  googleTicker?: string | null;
  quoteSymbol?: string | null;
  existingSector?: string | null;
}

export interface WatchlistSectorMatchResult {
  name: string;
  rawTicker?: string;
  matchedSector: string | null;
  sectorKeywords: string[];
  confidence: number;
  status: WatchlistSectorMatchStatus;
  reason: string;
  source: 'known_map' | 'keyword_rule' | 'ticker_type_rule' | 'existing' | 'none';
  needsReview: boolean;
}

type KnownEntry = { sector: string; keywords: string[]; confidence: number; reason: string };
type KeywordRule = { sector: string; keywords: string[] };

const WATCHLIST_KNOWN_SECTOR_MAP: Record<string, KnownEntry> = {
  'gs리테일': { sector: '소비/유통', keywords: ['리테일', '편의점', '유통', '소비재'], confidence: 95, reason: 'GS리테일 known map' },
  '007070': { sector: '소비/유통', keywords: ['리테일', '편의점', '유통', '소비재'], confidence: 95, reason: 'KR:007070 known map' },
  hlb: { sector: '바이오/헬스케어', keywords: ['바이오', '항암', '제약', '헬스케어'], confidence: 95, reason: 'HLB known map' },
  '028300': { sector: '바이오/헬스케어', keywords: ['바이오', '항암', '제약', '헬스케어'], confidence: 95, reason: 'KR:028300 known map' },
  '동성화인텍': { sector: '조선/LNG/소재', keywords: ['LNG', '보냉재', '조선', '소재'], confidence: 90, reason: '동성화인텍 known map' },
  '033500': { sector: '조선/LNG/소재', keywords: ['LNG', '보냉재', '조선', '소재'], confidence: 90, reason: 'KR:033500 known map' },
  '티웨이 항공': { sector: '항공/여행', keywords: ['항공', '여행', '여객', 'LCC'], confidence: 95, reason: '티웨이 known map' },
  '091810': { sector: '항공/여행', keywords: ['항공', '여행', '여객', 'LCC'], confidence: 95, reason: 'KR:091810 known map' },
  '파마리서치': { sector: '바이오/헬스케어', keywords: ['의료기기', '미용의료', '재생의학', '헬스케어'], confidence: 90, reason: '파마리서치 known map' },
  '214450': { sector: '바이오/헬스케어', keywords: ['의료기기', '미용의료', '재생의학', '헬스케어'], confidence: 90, reason: 'KR:214450 known map' },
  'tiger미디어컨텐츠': { sector: 'K-콘텐츠/미디어', keywords: ['미디어', '콘텐츠', '엔터', 'K-콘텐츠'], confidence: 95, reason: 'TIGER 미디어컨텐츠 known map' },
  '228810': { sector: 'K-콘텐츠/미디어', keywords: ['미디어', '콘텐츠', '엔터', 'K-콘텐츠'], confidence: 95, reason: 'KR:228810 known map' },
  '케이뱅크': { sector: '금융/핀테크', keywords: ['은행', '인터넷은행', '핀테크', '금융'], confidence: 95, reason: '케이뱅크 known map' },
  '279570': { sector: '금융/핀테크', keywords: ['은행', '인터넷은행', '핀테크', '금융'], confidence: 95, reason: 'KR:279570 known map' },
  '명인제약': { sector: '바이오/헬스케어', keywords: ['제약', '의약품', '헬스케어'], confidence: 90, reason: '명인제약 known map' },
  '317450': { sector: '바이오/헬스케어', keywords: ['제약', '의약품', '헬스케어'], confidence: 90, reason: 'KR:317450 known map' },
  '그리드위즈': { sector: 'AI/전력인프라', keywords: ['전력', '에너지', 'DR', '스마트그리드', '전력인프라'], confidence: 90, reason: '그리드위즈 known map' },
  '453450': { sector: 'AI/전력인프라', keywords: ['전력', '에너지', 'DR', '스마트그리드', '전력인프라'], confidence: 90, reason: 'KR:453450 known map' },
  'kodex 200 타겟 위클리 커버드 콜': { sector: 'ETF/인컴', keywords: ['ETF', '커버드콜', '인컴', 'KOSPI200'], confidence: 95, reason: 'KODEX coverd call known map' },
  '498400': { sector: 'ETF/인컴', keywords: ['ETF', '커버드콜', '인컴', 'KOSPI200'], confidence: 95, reason: 'KR:498400 known map' },
  '넷플릭스': { sector: 'K-콘텐츠/미디어', keywords: ['OTT', '스트리밍', '콘텐츠', '미디어'], confidence: 95, reason: '넷플릭스 known map' },
  nflx: { sector: 'K-콘텐츠/미디어', keywords: ['OTT', '스트리밍', '콘텐츠', '미디어'], confidence: 95, reason: 'US:NFLX known map' },
  '팔로알토 네트웍스': { sector: '사이버보안', keywords: ['사이버보안', '보안', '클라우드 보안', '네트워크 보안'], confidence: 95, reason: 'PANW known map' },
  panw: { sector: '사이버보안', keywords: ['사이버보안', '보안', '클라우드 보안', '네트워크 보안'], confidence: 95, reason: 'US:PANW known map' },
  '테슬라': { sector: '전기차/자율주행', keywords: ['전기차', '자율주행', '배터리', '로봇', '에너지'], confidence: 95, reason: 'TSLA known map' },
  tsla: { sector: '전기차/자율주행', keywords: ['전기차', '자율주행', '배터리', '로봇', '에너지'], confidence: 95, reason: 'US:TSLA known map' },
};

const WATCHLIST_SECTOR_KEYWORD_RULES: KeywordRule[] = [
  { sector: '바이오/헬스케어', keywords: ['바이오', '제약', '헬스', '파마', '메디', '리서치', '병원', '의료', '항암'] },
  { sector: 'K-콘텐츠/미디어', keywords: ['미디어', '콘텐츠', '엔터', '스튜디오', '드래곤', '넷플릭스', 'ott'] },
  { sector: '항공/여행', keywords: ['항공', '여행', '관광', '에어', '티웨이', '진에어'] },
  { sector: '금융/핀테크', keywords: ['은행', '금융', '증권', '카드', '핀테크', '뱅크'] },
  { sector: 'AI/전력인프라', keywords: ['전력', '그리드', '에너지', '전선', '변압기', '인프라', 'ai'] },
  { sector: '사이버보안', keywords: ['보안', '시큐리티', '팔로알토', 'panw', '크라우드스트라이크'] },
  { sector: '전기차/자율주행', keywords: ['전기차', '자율주행', '배터리', '테슬라', '모빌리티'] },
  { sector: 'ETF/인컴', keywords: ['etf', 'kodex', 'tiger', '커버드콜', '인컴', '배당'] },
  { sector: '소비/유통', keywords: ['리테일', '유통', '편의점', '소비', '마트', '백화점'] },
];

function normalizeToken(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

function normalizeCode(input: string | null | undefined): string {
  const t = (input ?? '').trim().toUpperCase();
  const m = t.match(/(\d{6})/);
  if (m) return m[1];
  const us = t.match(/\b[A-Z]{1,5}\b/g);
  return us?.[us.length - 1]?.toLowerCase() ?? '';
}

export function matchWatchlistSector(input: WatchlistSectorMatchInput): WatchlistSectorMatchResult {
  const nameKey = normalizeToken(input.name);
  const tickerCode = normalizeCode(input.symbol || input.rawTicker || input.googleTicker || input.quoteSymbol || '');
  if (input.existingSector?.trim()) {
    return {
      name: input.name,
      rawTicker: input.rawTicker,
      matchedSector: input.existingSector.trim(),
      sectorKeywords: [],
      confidence: 99,
      status: 'matched_existing_sector',
      reason: '기존 sector 값을 유지합니다.',
      source: 'existing',
      needsReview: false,
    };
  }
  const known = WATCHLIST_KNOWN_SECTOR_MAP[nameKey] ?? WATCHLIST_KNOWN_SECTOR_MAP[tickerCode];
  if (known) {
    return {
      name: input.name,
      rawTicker: input.rawTicker,
      matchedSector: known.sector,
      sectorKeywords: known.keywords,
      confidence: known.confidence,
      status: 'matched_known_map',
      reason: known.reason,
      source: 'known_map',
      needsReview: false,
    };
  }
  const blob = `${nameKey} ${normalizeToken(input.symbol)} ${normalizeToken(input.rawTicker)} ${normalizeToken(input.googleTicker)} ${normalizeToken(input.quoteSymbol)}`;
  const scored = WATCHLIST_SECTOR_KEYWORD_RULES.map((r) => ({
    rule: r,
    hits: r.keywords.filter((k) => blob.includes(k.toLowerCase())).length,
  })).filter((x) => x.hits > 0).sort((a, b) => b.hits - a.hits);
  if (scored.length > 0) {
    const top = scored[0]!;
    const confidence = top.hits >= 2 ? 82 : 64;
    return {
      name: input.name,
      rawTicker: input.rawTicker,
      matchedSector: top.rule.sector,
      sectorKeywords: top.rule.keywords,
      confidence,
      status: 'matched_keyword',
      reason: `키워드 ${top.hits}개 매칭`,
      source: 'keyword_rule',
      needsReview: confidence < 75,
    };
  }
  if (/\b(tiger|kodex|etf)\b/i.test(blob)) {
    return {
      name: input.name,
      rawTicker: input.rawTicker,
      matchedSector: 'ETF/인컴',
      sectorKeywords: ['ETF'],
      confidence: 58,
      status: 'matched_ticker_type',
      reason: 'ETF 유형 티커/이름 규칙 매칭',
      source: 'ticker_type_rule',
      needsReview: true,
    };
  }
  return {
    name: input.name,
    rawTicker: input.rawTicker,
    matchedSector: null,
    sectorKeywords: [],
    confidence: 0,
    status: 'no_match',
    reason: 'known map/keyword rule 미매칭',
    source: 'none',
    needsReview: true,
  };
}

export function normalizeWatchlistMarket(v: string | null | undefined): 'KR' | 'US' | 'JP' | 'UNKNOWN' {
  const t = (v ?? '').trim().toUpperCase();
  if (t === 'KR' || t === 'US' || t === 'JP') return t;
  return 'UNKNOWN';
}

export function mapWatchlistRowToSectorMatchInput(row: WebPortfolioWatchlistRow): WatchlistSectorMatchInput {
  return {
    symbol: `${row.market}:${row.symbol}`,
    name: row.name,
    market: normalizeWatchlistMarket(row.market),
    rawTicker: row.symbol,
    googleTicker: row.google_ticker,
    quoteSymbol: row.quote_symbol,
    existingSector: row.sector,
  };
}
