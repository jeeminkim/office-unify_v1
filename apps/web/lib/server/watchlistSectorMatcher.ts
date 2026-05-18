import type { WebPortfolioWatchlistRow } from '@office-unify/supabase-access';
import type { SectorRadarAnchorAsset, WatchlistSectorMatchScores } from '@office-unify/shared-types';
import { listRelatedAnchorsBySectorName } from '@/lib/server/sectorRadarRegistry';

export type WatchlistSectorMatchStatus =
  | 'matched_known_map'
  | 'matched_keyword'
  | 'matched_ticker_type'
  | 'matched_existing_sector'
  | 'needs_review'
  | 'no_match';

/** UI·apply 필터용 버킷 (additive) */
export type WatchlistSectorApplyBucket =
  | 'already_matched'
  | 'manual_locked'
  | 'needs_review'
  | 'no_match'
  | 'quote_missing'
  | 'low_confidence'
  | 'ready_to_apply';

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
  relatedAnchors?: SectorRadarAnchorAsset[];
  matchScores?: WatchlistSectorMatchScores;
  reviewHint?: string;
  applyBucket?: WatchlistSectorApplyBucket;
  bucketReason?: string;
}

export function classifyWatchlistSectorApplyBucket(
  res: WatchlistSectorMatchResult,
  row?: { sector_is_manual?: boolean | null; google_ticker?: string | null; quote_symbol?: string | null },
): WatchlistSectorApplyBucket {
  if (row?.sector_is_manual) {
    return 'manual_locked';
  }
  if (res.status === 'matched_existing_sector') {
    return 'already_matched';
  }
  const quoteScore = res.matchScores?.quoteValidationScore ?? 0;
  if (!row?.google_ticker?.trim() && !row?.quote_symbol?.trim() && quoteScore < 50) {
    return 'quote_missing';
  }
  if (res.status === 'no_match' || !res.matchedSector) {
    return 'no_match';
  }
  if (res.needsReview && res.matchedSector) {
    return 'needs_review';
  }
  if (res.confidence < 75) {
    return 'low_confidence';
  }
  return 'ready_to_apply';
}

export function bucketReasonLabel(bucket: WatchlistSectorApplyBucket): string {
  switch (bucket) {
    case 'already_matched':
      return '현재 섹터가 있어 자동 매칭 대상에서 제외';
    case 'manual_locked':
      return '수동 지정 보호';
    case 'needs_review':
      return '검토 후 적용';
    case 'quote_missing':
      return '시세/ticker 확인 필요';
    case 'low_confidence':
      return '키워드만 일치해 검토 필요';
    case 'no_match':
      return 'registry 없음';
    case 'ready_to_apply':
      return '자동 적용 가능';
    default:
      return '';
  }
}

type KnownEntry = { sector: string; keywords: string[]; confidence: number; reason: string };
type KeywordRule = { sector: string; keywords: string[] };

const WATCHLIST_KNOWN_SECTOR_MAP: Record<string, KnownEntry> = {
  'gs리테일': { sector: '소비/유통', keywords: ['리테일', '편의점', '유통', '소비재'], confidence: 95, reason: 'GS리테일 known map' },
  '007070': { sector: '소비/유통', keywords: ['리테일', '편의점', '유통', '소비재'], confidence: 95, reason: 'KR:007070 known map' },
  '롯데정밀화학': { sector: '화학/소재', keywords: ['화학', '소재', '정밀화학'], confidence: 92, reason: '롯데정밀화학 known map' },
  '004000': { sector: '화학/소재', keywords: ['화학', '소재', '정밀화학'], confidence: 92, reason: 'KR:004000 known map' },
  '코스모화학': { sector: '2차전지/소재', keywords: ['2차전지', '화학', '소재', '양극재'], confidence: 90, reason: '코스모화학 known map' },
  '005420': { sector: '2차전지/소재', keywords: ['2차전지', '화학', '소재'], confidence: 90, reason: 'KR:005420 known map' },
  '롯데케미칼': { sector: '화학/소재', keywords: ['석유화학', '화학', '소재'], confidence: 92, reason: '롯데케미칼 known map' },
  '011170': { sector: '화학/소재', keywords: ['석유화학', '화학', '소재'], confidence: 92, reason: 'KR:011170 known map' },
  hlb: { sector: '바이오/헬스케어', keywords: ['바이오', '항암', '제약', '헬스케어'], confidence: 95, reason: 'HLB known map' },
  '028300': { sector: '바이오/헬스케어', keywords: ['바이오', '항암', '제약', '헬스케어'], confidence: 95, reason: 'KR:028300 known map' },
  '동성화인텍': { sector: '조선/LNG/소재', keywords: ['LNG', '보냉재', '조선', '소재'], confidence: 90, reason: '동성화인텍 known map' },
  '033500': { sector: '조선/LNG/소재', keywords: ['LNG', '보냉재', '조선', '소재'], confidence: 90, reason: 'KR:033500 known map' },
  '한화오션': { sector: '조선/방산', keywords: ['조선', '해양', 'LNG', '방산'], confidence: 92, reason: '한화오션 known map' },
  '042660': { sector: '조선/방산', keywords: ['조선', '해양', 'LNG'], confidence: 92, reason: 'KR:042660 known map' },
  '티웨이 항공': { sector: '항공/여행', keywords: ['항공', '여행', '여객', 'LCC'], confidence: 95, reason: '티웨이 known map' },
  '티웨이항공': { sector: '항공/여행', keywords: ['항공', '여행', '여객', 'LCC'], confidence: 95, reason: '티웨이항공 known map' },
  '091810': { sector: '항공/여행', keywords: ['항공', '여행', '여객', 'LCC'], confidence: 95, reason: 'KR:091810 known map' },
  '고영': { sector: '반도체장비', keywords: ['반도체', '검사장비', 'HBM', '장비'], confidence: 88, reason: '고영 known map' },
  '098460': { sector: '반도체장비', keywords: ['반도체', '검사장비', 'HBM'], confidence: 88, reason: 'KR:098460 known map' },
  '일진전기': { sector: 'AI/전력인프라', keywords: ['전력기기', '변압기', '전력인프라', '송전'], confidence: 90, reason: '일진전기 known map' },
  '103590': { sector: 'AI/전력인프라', keywords: ['전력기기', '변압기', '전력인프라'], confidence: 90, reason: 'KR:103590 known map' },
  '파마리서치': { sector: '바이오/헬스케어', keywords: ['의료기기', '미용의료', '재생의학', '헬스케어'], confidence: 90, reason: '파마리서치 known map' },
  '214450': { sector: '바이오/헬스케어', keywords: ['의료기기', '미용의료', '재생의학', '헬스케어'], confidence: 90, reason: 'KR:214450 known map' },
  'tiger미디어컨텐츠': { sector: 'K-콘텐츠/미디어', keywords: ['미디어', '콘텐츠', '엔터', 'K-콘텐츠'], confidence: 95, reason: 'TIGER 미디어컨텐츠 known map' },
  '228810': { sector: 'K-콘텐츠/미디어', keywords: ['미디어', '콘텐츠', '엔터', 'K-콘텐츠'], confidence: 95, reason: 'KR:228810 known map' },
  '케이뱅크': { sector: '금융/핀테크', keywords: ['은행', '인터넷은행', '핀테크', '금융'], confidence: 95, reason: '케이뱅크 known map' },
  '279570': { sector: '금융/핀테크', keywords: ['은행', '인터넷은행', '핀테크', '금융'], confidence: 95, reason: 'KR:279570 known map' },
  '한화에어로스페이스': { sector: '방산/우주항공', keywords: ['방산', '항공우주', '엔진', '우주'], confidence: 92, reason: '한화에어로 known map' },
  '012450': { sector: '방산/우주항공', keywords: ['방산', '항공우주', '엔진'], confidence: 92, reason: 'KR:012450 known map' },
  'hd현대중공업': { sector: '조선/LNG', keywords: ['조선', 'LNG', '해양플랜트'], confidence: 92, reason: 'HD현대중공업 known map' },
  '329180': { sector: '조선/LNG', keywords: ['조선', 'LNG', '해양'], confidence: 92, reason: 'KR:329180 known map' },
  '삼성중공업': { sector: '조선/LNG', keywords: ['조선', 'LNG', '해양'], confidence: 92, reason: '삼성중공업 known map' },
  '010140': { sector: '조선/LNG', keywords: ['조선', 'LNG', '해양'], confidence: 92, reason: 'KR:010140 known map' },
  'hd현대미포': { sector: '조선/LNG', keywords: ['조선', 'LNG', '미포'], confidence: 90, reason: 'HD현대미포 known map' },
  '010620': { sector: '조선/LNG', keywords: ['조선', 'LNG'], confidence: 90, reason: 'KR:010620 known map' },
  naver: { sector: '인터넷/플랫폼', keywords: ['플랫폼', '검색', 'K-콘텐츠', '인터넷'], confidence: 95, reason: 'NAVER known map' },
  '035420': { sector: '인터넷/플랫폼', keywords: ['플랫폼', '검색', '인터넷'], confidence: 95, reason: 'KR:035420 known map' },
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
  { sector: 'AI/전력인프라', keywords: ['전력', '그리드', '에너지', '전선', '변압기', '인프라', 'ai', '일진'] },
  { sector: '조선/LNG', keywords: ['조선', 'lng', '해양', '중공업', '미포'] },
  { sector: '조선/방산', keywords: ['조선', '방산', '한화오션', '해양'] },
  { sector: '화학/소재', keywords: ['화학', '케미칼', '정밀화학', '소재'] },
  { sector: '2차전지/소재', keywords: ['2차전지', '양극재', '코스모'] },
  { sector: '사이버보안', keywords: ['보안', '시큐리티', '팔로알토', 'panw', '크라우드스트라이크'] },
  { sector: '전기차/자율주행', keywords: ['전기차', '자율주행', '배터리', '테슬라', '모빌리티'] },
  { sector: 'ETF/인컴', keywords: ['etf', 'kodex', 'tiger', '커버드콜', '인컴', '배당'] },
  { sector: '소비/유통', keywords: ['리테일', '유통', '편의점', '소비', '마트', '백화점'] },
  { sector: '반도체장비', keywords: ['반도체', '장비', '검사', '고영'] },
  { sector: '인터넷/플랫폼', keywords: ['네이버', 'naver', '플랫폼', '검색'] },
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

function computeQuoteValidationScore(input: WatchlistSectorMatchInput): number {
  const hasTicker = Boolean(input.googleTicker?.trim() || input.quoteSymbol?.trim());
  if (!hasTicker) return 0;
  const gt = (input.googleTicker ?? '').trim();
  const qs = (input.quoteSymbol ?? '').trim();
  if (gt.length >= 5 && (gt.includes(':') || gt.startsWith('KRX:') || gt.startsWith('NASDAQ:'))) return 72;
  if (qs.length >= 4) return 58;
  return 40;
}

function buildMatchScores(input: {
  quoteValidationScore: number;
  nameKeywordScore: number;
  registryAliasScore: number;
  manualOverrideScore: number;
  sectorRadarAnchorScore: number;
}): WatchlistSectorMatchScores {
  const finalSectorMatchScore = Math.min(
    100,
    Math.round(
      input.registryAliasScore * 0.45 +
        input.nameKeywordScore * 0.25 +
        input.quoteValidationScore * 0.15 +
        input.sectorRadarAnchorScore * 0.1 +
        input.manualOverrideScore * 0.05,
    ),
  );
  return { ...input, finalSectorMatchScore };
}

function reviewHintFor(
  status: WatchlistSectorMatchStatus,
  quoteScore: number,
  input: WatchlistSectorMatchInput,
): string | undefined {
  if (status === 'matched_existing_sector') return undefined;
  if (!input.googleTicker?.trim() && !input.quoteSymbol?.trim()) return '시세 확인 실패 — google_ticker·quote_symbol 필요';
  if (quoteScore >= 50 && status === 'no_match') return 'ticker는 확인됐으나 섹터 registry 없음 — 수동 검토 또는 registry 보강';
  if (status === 'matched_keyword' && quoteScore < 50) return '종목명 키워드만 매칭됨 — quote 검증 후 적용 권장';
  if (status === 'matched_ticker_type') return 'ETF 테마 registry 필요 — 대표 ETF·테마 라벨 확인';
  if (status === 'needs_review' || status === 'no_match') return '수동 확인 필요';
  return undefined;
}

export function matchWatchlistSector(input: WatchlistSectorMatchInput): WatchlistSectorMatchResult {
  const nameKey = normalizeToken(input.name);
  const tickerCode = normalizeCode(input.symbol || input.rawTicker || input.googleTicker || input.quoteSymbol || '');
  const quoteValidationScore = computeQuoteValidationScore(input);

  if (input.existingSector?.trim()) {
    const matchScores = buildMatchScores({
      quoteValidationScore,
      nameKeywordScore: 0,
      registryAliasScore: 0,
      manualOverrideScore: 99,
      sectorRadarAnchorScore: 0,
    });
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
      matchScores,
    };
  }

  const known = WATCHLIST_KNOWN_SECTOR_MAP[nameKey] ?? WATCHLIST_KNOWN_SECTOR_MAP[tickerCode];
  if (known) {
    const anchors = listRelatedAnchorsBySectorName(known.sector, 3);
    const sectorRadarAnchorScore = anchors.length > 0 ? Math.min(90, 50 + anchors.length * 12) : 0;
    const registryAliasScore = known.confidence;
    const matchScores = buildMatchScores({
      quoteValidationScore,
      nameKeywordScore: 0,
      registryAliasScore,
      manualOverrideScore: 0,
      sectorRadarAnchorScore,
    });
    const confidence =
      quoteValidationScore >= 50
        ? Math.min(known.confidence, Math.max(matchScores.finalSectorMatchScore, Math.round(registryAliasScore * 0.9)))
        : Math.min(known.confidence - 15, matchScores.finalSectorMatchScore);
    return {
      name: input.name,
      rawTicker: input.rawTicker,
      matchedSector: known.sector,
      sectorKeywords: known.keywords,
      confidence,
      status: 'matched_known_map',
      reason:
        quoteValidationScore >= 50
          ? `${known.reason} · quote 검증 + registry`
          : `${known.reason} · registry(quote 미확인)`,
      source: 'known_map',
      needsReview: confidence < 75,
      matchScores,
      reviewHint: reviewHintFor('matched_known_map', quoteValidationScore, input),
    };
  }

  const blob = `${nameKey} ${normalizeToken(input.symbol)} ${normalizeToken(input.rawTicker)} ${normalizeToken(input.googleTicker)} ${normalizeToken(input.quoteSymbol)}`;
  const scored = WATCHLIST_SECTOR_KEYWORD_RULES.map((r) => ({
    rule: r,
    hits: r.keywords.filter((k) => blob.includes(k.toLowerCase())).length,
  }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  if (scored.length > 0) {
    const top = scored[0]!;
    const nameKeywordScore = top.hits >= 2 ? 82 : 64;
    const anchors = listRelatedAnchorsBySectorName(top.rule.sector, 3);
    const sectorRadarAnchorScore = anchors.length > 0 ? Math.min(80, 40 + anchors.length * 10) : 0;
    const matchScores = buildMatchScores({
      quoteValidationScore,
      nameKeywordScore,
      registryAliasScore: 0,
      manualOverrideScore: 0,
      sectorRadarAnchorScore,
    });
    const confidence =
      quoteValidationScore >= 50 && top.hits >= 2
        ? Math.min(88, matchScores.finalSectorMatchScore)
        : Math.min(72, matchScores.finalSectorMatchScore);
    return {
      name: input.name,
      rawTicker: input.rawTicker,
      matchedSector: top.rule.sector,
      sectorKeywords: top.rule.keywords,
      confidence,
      status: 'matched_keyword',
      reason: `키워드 ${top.hits}개 매칭${quoteValidationScore >= 50 ? ' · quote 확인' : ''}`,
      source: 'keyword_rule',
      needsReview: confidence < 75,
      matchScores,
      reviewHint: reviewHintFor('matched_keyword', quoteValidationScore, input),
    };
  }

  if (/\b(tiger|kodex|etf)\b/i.test(blob)) {
    const matchScores = buildMatchScores({
      quoteValidationScore,
      nameKeywordScore: 40,
      registryAliasScore: 0,
      manualOverrideScore: 0,
      sectorRadarAnchorScore: 0,
    });
    return {
      name: input.name,
      rawTicker: input.rawTicker,
      matchedSector: 'ETF/인컴',
      sectorKeywords: ['ETF'],
      confidence: Math.min(58, matchScores.finalSectorMatchScore),
      status: 'matched_ticker_type',
      reason: 'ETF 유형 티커/이름 규칙 매칭',
      source: 'ticker_type_rule',
      needsReview: true,
      matchScores,
      reviewHint: reviewHintFor('matched_ticker_type', quoteValidationScore, input),
    };
  }

  const matchScores = buildMatchScores({
    quoteValidationScore,
    nameKeywordScore: 0,
    registryAliasScore: 0,
    manualOverrideScore: 0,
    sectorRadarAnchorScore: 0,
  });

  return {
    name: input.name,
    rawTicker: input.rawTicker,
    matchedSector: null,
    sectorKeywords: [],
    confidence: 0,
    status: 'no_match',
    reason: quoteValidationScore > 0 ? 'ticker 확인·섹터 registry 미매칭' : 'known map/keyword rule 미매칭',
    source: 'none',
    needsReview: true,
    matchScores,
    reviewHint: reviewHintFor('no_match', quoteValidationScore, input),
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
