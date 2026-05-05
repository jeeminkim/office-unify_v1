import 'server-only';

import type { WebPortfolioWatchlistRow } from '@office-unify/supabase-access';

export type SectorRadarMarket = 'KR' | 'US';

export type SectorRadarAnchorSeed = {
  symbol: string;
  name: string;
  sourceLabel: 'seed';
  market?: SectorRadarMarket;
  /** KR 기본 KRX:pad6, US·명시 시 그대로 사용 */
  googleTicker?: string;
};

export type SectorRadarCategorySeed = {
  key: string;
  name: string;
  /** 관심종목 sector/메모 키워드와 매칭 (소문자 비교) */
  keywords: string[];
  anchors: SectorRadarAnchorSeed[];
};

export const SECTOR_RADAR_SHEET_NAME = process.env.SECTOR_RADAR_QUOTES_SHEET_NAME?.trim() || 'sector_radar_quotes';

export function normalizedSectorSymbol(market: SectorRadarMarket, symbol: string): string {
  const t = symbol.trim().toUpperCase();
  if (market === 'KR' && /^\d+$/.test(t)) return t.padStart(6, '0');
  return t;
}

export function buildSectorRadarNormalizedKey(categoryKey: string, market: SectorRadarMarket, symbol: string): string {
  return `${categoryKey}::${market}::${normalizedSectorSymbol(market, symbol)}`;
}

export function parseSectorRadarNormalizedKey(raw: string): { categoryKey: string; market: SectorRadarMarket; symbol: string } | null {
  const t = raw.trim();
  const parts = t.split('::');
  if (parts.length !== 3) return null;
  const [categoryKey, marketRaw, symbolRaw] = parts;
  if (!categoryKey || !symbolRaw) return null;
  const mu = (marketRaw || '').toUpperCase();
  if (mu !== 'KR' && mu !== 'US') return null;
  const market = mu as SectorRadarMarket;
  return { categoryKey, market, symbol: normalizedSectorSymbol(market, symbolRaw) };
}

/** 운영 중 수정 가능한 seed. 잘못된 티커는 시트 read-back에서 NO_DATA 처리. */
export const SECTOR_RADAR_CATEGORY_SEEDS: SectorRadarCategorySeed[] = [
  {
    key: 'semiconductor',
    name: '반도체',
    keywords: ['반도체', 'semiconductor', 'chip', '메모리'],
    anchors: [
      { symbol: '091160', name: 'KODEX 반도체', sourceLabel: 'seed' },
      { symbol: '381180', name: 'TIGER 미국필라델피아반도체나스닥', sourceLabel: 'seed' },
      { symbol: '396500', name: 'TIGER Fn반도체TOP10', sourceLabel: 'seed' },
    ],
  },
  {
    key: 'battery',
    name: '2차전지/배터리',
    keywords: ['2차전지', '배터리', 'battery', 'ev'],
    anchors: [
      { symbol: '305540', name: 'TIGER 2차전지테마', sourceLabel: 'seed' },
      { symbol: '364980', name: 'TIGER 2차전지TOP10', sourceLabel: 'seed' },
      { symbol: '462010', name: 'TIGER 2차전지소재Fn', sourceLabel: 'seed' },
    ],
  },
  {
    key: 'bio',
    name: '바이오/헬스케어',
    keywords: ['바이오', '헬스', 'bio', 'health', '제약'],
    anchors: [
      { symbol: '364970', name: 'TIGER 바이오TOP10', sourceLabel: 'seed' },
      { symbol: '266420', name: 'KODEX 헬스케어', sourceLabel: 'seed' },
      { symbol: '143860', name: 'TIGER 헬스케어', sourceLabel: 'seed' },
    ],
  },
  {
    key: 'nuclear_energy',
    name: '원전/SMR/에너지',
    keywords: ['원전', 'smr', '원자력', '에너지', 'nuclear'],
    anchors: [
      { symbol: '434730', name: 'HANARO 원자력iSelect', sourceLabel: 'seed' },
      { symbol: '433500', name: 'ACE 원자력테마딥서치', sourceLabel: 'seed' },
      { symbol: '442320', name: 'KODEX K-원자력액티브', sourceLabel: 'seed' },
    ],
  },
  {
    key: 'ai_power_infra',
    name: 'AI/전력인프라',
    keywords: ['ai', '전력', '인프라', '데이터센터', '인공지능'],
    anchors: [
      { symbol: '456600', name: 'TIMEFOLIO 글로벌AI인공지능액티브', sourceLabel: 'seed' },
      { symbol: '466920', name: 'SOL 조선TOP3플러스', sourceLabel: 'seed' },
    ],
  },
  {
    key: 'us_growth',
    name: '미국 성장/나스닥',
    keywords: ['나스닥', 's&p', '미국', 'nasdaq', 'sp500'],
    anchors: [
      { symbol: '133690', name: 'TIGER 미국나스닥100', sourceLabel: 'seed' },
      { symbol: '379810', name: 'KODEX 미국나스닥100TR', sourceLabel: 'seed' },
      { symbol: '360750', name: 'TIGER 미국S&P500', sourceLabel: 'seed' },
    ],
  },
  {
    key: 'crypto',
    name: '코인/디지털자산',
    keywords: [
      'bitcoin',
      'btc',
      'ethereum',
      'eth',
      'solana',
      'crypto',
      'coin',
      'digital asset',
      '블록체인',
      '비트코인',
      '이더리움',
      '솔라나',
      '코인',
    ],
    anchors: [
      { symbol: 'IBIT', name: 'iShares Bitcoin Trust', sourceLabel: 'seed', market: 'US', googleTicker: 'IBIT' },
      { symbol: 'FBTC', name: 'Fidelity Wise Origin Bitcoin Fund', sourceLabel: 'seed', market: 'US', googleTicker: 'FBTC' },
      { symbol: 'ARKB', name: 'ARK 21Shares Bitcoin ETF', sourceLabel: 'seed', market: 'US', googleTicker: 'ARKB' },
      { symbol: 'ETHA', name: 'iShares Ethereum Trust', sourceLabel: 'seed', market: 'US', googleTicker: 'ETHA' },
      { symbol: 'FETH', name: 'Fidelity Ethereum Fund', sourceLabel: 'seed', market: 'US', googleTicker: 'FETH' },
      { symbol: 'COIN', name: 'Coinbase Global Inc', sourceLabel: 'seed', market: 'US', googleTicker: 'NASDAQ:COIN' },
      { symbol: 'MSTR', name: 'MicroStrategy Inc', sourceLabel: 'seed', market: 'US', googleTicker: 'NASDAQ:MSTR' },
    ],
  },
  {
    key: 'defense_space',
    name: '방산/우주항공',
    keywords: ['방산', '우주', '항공', 'defense'],
    anchors: [
      { symbol: '449450', name: 'PLUS K방산', sourceLabel: 'seed' },
      { symbol: '463280', name: 'TIGER 우주방산', sourceLabel: 'seed' },
      { symbol: '442550', name: 'KODEX K-방산', sourceLabel: 'seed' },
    ],
  },
  {
    key: 'shipping',
    name: '조선/해운',
    keywords: ['조선', '해운', 'shipping', '해양'],
    anchors: [
      { symbol: '466920', name: 'SOL 조선TOP3플러스', sourceLabel: 'seed' },
      { symbol: '494670', name: 'TIGER 조선TOP10', sourceLabel: 'seed' },
      { symbol: '441540', name: 'HANARO Fn조선해운', sourceLabel: 'seed' },
    ],
  },
  {
    key: 'k_content',
    name: 'K-콘텐츠/미디어',
    keywords: ['콘텐츠', '미디어', '엔터', 'media', 'entertainment'],
    anchors: [
      { symbol: '228810', name: 'TIGER 미디어컨텐츠', sourceLabel: 'seed' },
      { symbol: '266360', name: 'KODEX 미디어&엔터테인먼트', sourceLabel: 'seed' },
      { symbol: '367770', name: 'RISE Fn컨택트대표', sourceLabel: 'seed' },
    ],
  },
  {
    key: 'consumer_retail',
    name: '소비/유통',
    keywords: ['소비', '유통', '리테일', '편의점', '마트', '백화점'],
    anchors: [],
  },
  {
    key: 'airline_travel',
    name: '항공/여행',
    keywords: ['항공', '여행', '관광', 'lcc', '에어'],
    anchors: [],
  },
  {
    key: 'finance_fintech',
    name: '금융/핀테크',
    keywords: ['금융', '핀테크', '은행', '카드', '증권', '뱅크'],
    anchors: [],
  },
  {
    key: 'cybersecurity',
    name: '사이버보안',
    keywords: ['사이버보안', '보안', '시큐리티', '클라우드 보안', '네트워크 보안'],
    anchors: [
      { symbol: 'PANW', name: 'Palo Alto Networks', sourceLabel: 'seed', market: 'US', googleTicker: 'NASDAQ:PANW' },
    ],
  },
  {
    key: 'ev_autonomous',
    name: '전기차/자율주행',
    keywords: ['전기차', '자율주행', '배터리', '모빌리티', '테슬라'],
    anchors: [
      { symbol: 'TSLA', name: 'Tesla', sourceLabel: 'seed', market: 'US', googleTicker: 'NASDAQ:TSLA' },
    ],
  },
  {
    key: 'etf_income',
    name: 'ETF/인컴',
    keywords: ['etf', '인컴', '커버드콜', '배당', 'kodex', 'tiger'],
    anchors: [],
  },
  {
    key: 'shipping_lng_material',
    name: '조선/LNG/소재',
    keywords: ['조선', 'lng', '보냉재', '소재', '해운'],
    anchors: [],
  },
];

export type MergedSectorRadarAnchor = {
  categoryKey: string;
  categoryName: string;
  market: SectorRadarMarket;
  symbol: string;
  name: string;
  googleTicker: string;
  sourceLabel: 'seed' | 'watchlist';
};

function padKrSymbol(symbol: string): string {
  const t = symbol.trim().toUpperCase();
  if (/^\d+$/.test(t)) return t.padStart(6, '0');
  return t;
}

function defaultGoogleTickerKr(symbol: string): string {
  return `KRX:${padKrSymbol(symbol)}`;
}

function resolveSeedGoogleTicker(seed: SectorRadarAnchorSeed): { market: SectorRadarMarket; ticker: string; symbolNorm: string } {
  const market: SectorRadarMarket = seed.market ?? 'KR';
  const symbolNorm = normalizedSectorSymbol(market, seed.symbol);
  const ticker = (seed.googleTicker?.trim() || (market === 'KR' ? defaultGoogleTickerKr(seed.symbol) : symbolNorm)).toUpperCase();
  return { market, ticker, symbolNorm };
}

function watchlistTextBlob(row: WebPortfolioWatchlistRow): string {
  return [row.sector ?? '', row.name ?? '', row.investment_memo ?? '', row.interest_reason ?? '', row.observation_points ?? '']
    .join(' ')
    .toLowerCase();
}

function categoryMatch(category: SectorRadarCategorySeed, blob: string): boolean {
  return category.keywords.some((k) => blob.includes(k.toLowerCase()));
}

function normLower(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

const SECTOR_LABEL_ALIAS_TO_KEYS: Record<string, string[]> = {
  '바이오/헬스케어': ['bio'],
  'k-콘텐츠/미디어': ['k_content'],
  'ai/전력인프라': ['ai_power_infra'],
  '소비/유통': ['consumer_retail'],
  '항공/여행': ['airline_travel'],
  '금융/핀테크': ['finance_fintech'],
  '사이버보안': ['cybersecurity'],
  '전기차/자율주행': ['ev_autonomous'],
  'etf/인컴': ['etf_income'],
  '조선/lng/소재': ['shipping_lng_material'],
};

/** 관심종목 텍스트·섹터 필드로 매칭되는 sector_radar 카테고리 키 목록 */
export function listSectorKeysMatchingWatchlist(row: WebPortfolioWatchlistRow): string[] {
  const blob = watchlistTextBlob(row);
  const hs = normLower(row.sector);
  const out = new Set<string>();
  if (hs && SECTOR_LABEL_ALIAS_TO_KEYS[hs]) {
    for (const k of SECTOR_LABEL_ALIAS_TO_KEYS[hs]) out.add(k);
  }
  for (const cat of SECTOR_RADAR_CATEGORY_SEEDS) {
    if (categoryMatch(cat, blob)) out.add(cat.key);
    const catName = normLower(cat.name);
    const catKey = normLower(cat.key);
    if (hs && catName) {
      if (hs === catName || hs.includes(catName) || catName.includes(hs)) out.add(cat.key);
      if (catKey.length >= 3 && hs.includes(catKey)) out.add(cat.key);
    }
  }
  return [...out];
}

function mergeKey(a: MergedSectorRadarAnchor): string {
  return `${a.categoryKey}:${a.market}:${normalizedSectorSymbol(a.market, a.symbol)}`;
}

/**
 * seed registry + 관심종목 중 키워드 매칭으로 custom anchor 병합.
 * 동일 category+market+symbol 은 한 번만 유지.
 */
export function buildMergedSectorRadarAnchors(watchlist: WebPortfolioWatchlistRow[]): MergedSectorRadarAnchor[] {
  const seen = new Set<string>();
  const out: MergedSectorRadarAnchor[] = [];

  const push = (row: MergedSectorRadarAnchor) => {
    const key = mergeKey(row);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(row);
  };

  for (const cat of SECTOR_RADAR_CATEGORY_SEEDS) {
    for (const a of cat.anchors) {
      const { market, ticker, symbolNorm } = resolveSeedGoogleTicker(a);
      push({
        categoryKey: cat.key,
        categoryName: cat.name,
        market,
        symbol: symbolNorm,
        name: a.name,
        googleTicker: ticker,
        sourceLabel: 'seed',
      });
    }
  }

  for (const w of watchlist) {
    const market = w.market as SectorRadarMarket;
    if (market !== 'KR' && market !== 'US') continue;

    const blob = watchlistTextBlob(w);
    const ticker = (w.google_ticker?.trim() || (market === 'KR' ? defaultGoogleTickerKr(w.symbol) : w.symbol.trim().toUpperCase())).toUpperCase();

    if (market === 'KR') {
      const sym = padKrSymbol(w.symbol);
      if (!/^\d{6}$/.test(sym)) continue;
      for (const cat of SECTOR_RADAR_CATEGORY_SEEDS) {
        if (!categoryMatch(cat, blob)) continue;
        push({
          categoryKey: cat.key,
          categoryName: cat.name,
          market: 'KR',
          symbol: sym,
          name: (w.name ?? sym).trim() || sym,
          googleTicker: ticker,
          sourceLabel: 'watchlist',
        });
      }
    } else {
      const sym = normalizedSectorSymbol('US', w.symbol);
      if (!sym) continue;
      for (const cat of SECTOR_RADAR_CATEGORY_SEEDS) {
        if (!categoryMatch(cat, blob)) continue;
        push({
          categoryKey: cat.key,
          categoryName: cat.name,
          market: 'US',
          symbol: sym,
          name: (w.name ?? sym).trim() || sym,
          googleTicker: ticker,
          sourceLabel: 'watchlist',
        });
      }
    }
  }

  return out;
}
