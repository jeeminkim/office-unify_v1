import 'server-only';
import type { WebPortfolioWatchlistRow } from '@office-unify/supabase-access';
import { getSectorKeyByAliasName, normalizeSectorLabelForLookup } from '@/lib/sectorRadarRegistry.shared';

export type SectorRadarMarket = 'KR' | 'US';

export type SectorRadarAnchorSeed = {
  symbol: string;
  name: string;
  sourceLabel: 'seed';
  market?: SectorRadarMarket;
  /** KR 기본 KRX:pad6, US·명시 시 그대로 사용 */
  googleTicker?: string;
  quoteSymbol?: string;
  assetType?: 'ETF' | 'STOCK';
  role?: 'core_etf' | 'theme_etf' | 'representative_stock' | 'fallback_proxy';
  confidence?: number;
  reason?: string;
};

export type SectorRadarCategorySeed = {
  key: string;
  name: string;
  /** 관심종목 sector/메모 키워드와 매칭 (소문자 비교) */
  keywords: string[];
  anchors: SectorRadarAnchorSeed[];
};

export type SectorRadarAnchorAsset = {
  name: string;
  market: SectorRadarMarket;
  assetType: 'ETF' | 'STOCK';
  symbol: string;
  googleTicker?: string;
  quoteSymbol?: string;
  role: 'core_etf' | 'theme_etf' | 'representative_stock' | 'fallback_proxy';
  confidence: number;
  reason: string;
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
      { symbol: '091160', name: 'KODEX 반도체', sourceLabel: 'seed', quoteSymbol: '091160.KS', assetType: 'ETF', role: 'core_etf', confidence: 95, reason: '국내 반도체 대표 ETF' },
      { symbol: '381180', name: 'TIGER 미국필라델피아반도체나스닥', sourceLabel: 'seed', quoteSymbol: '381180.KS', assetType: 'ETF', role: 'theme_etf', confidence: 92, reason: '필라델피아 반도체 지수 추종' },
      { symbol: '396500', name: 'TIGER Fn반도체TOP10', sourceLabel: 'seed', quoteSymbol: '396500.KS', assetType: 'ETF', role: 'theme_etf', confidence: 92, reason: '국내 반도체 Top10' },
      { symbol: 'SOXX', name: 'iShares Semiconductor ETF', sourceLabel: 'seed', market: 'US', googleTicker: 'NASDAQ:SOXX', quoteSymbol: 'SOXX', assetType: 'ETF', role: 'core_etf', confidence: 90, reason: '미국 반도체 대표 ETF' },
      { symbol: 'SMH', name: 'VanEck Semiconductor ETF', sourceLabel: 'seed', market: 'US', googleTicker: 'NASDAQ:SMH', quoteSymbol: 'SMH', assetType: 'ETF', role: 'theme_etf', confidence: 88, reason: '미국 반도체 대형주 바스켓' },
    ],
  },
  {
    key: 'battery',
    name: '2차전지/배터리',
    keywords: ['2차전지', '배터리', 'battery', 'ev'],
    anchors: [
      { symbol: '305540', name: 'TIGER 2차전지테마', sourceLabel: 'seed', quoteSymbol: '305540.KS', assetType: 'ETF', role: 'core_etf', confidence: 95, reason: '2차전지 테마 대표 ETF' },
      { symbol: '364980', name: 'TIGER 2차전지TOP10', sourceLabel: 'seed', quoteSymbol: '364980.KS', assetType: 'ETF', role: 'core_etf', confidence: 93, reason: '2차전지 대표 종목군' },
      { symbol: '462010', name: 'TIGER 2차전지소재Fn', sourceLabel: 'seed', quoteSymbol: '462010.KS', assetType: 'ETF', role: 'theme_etf', confidence: 90, reason: '소재 밸류체인 반영' },
      { symbol: '305720', name: 'KODEX 2차전지산업', sourceLabel: 'seed', quoteSymbol: '305720.KS', assetType: 'ETF', role: 'theme_etf', confidence: 88, reason: '산업 전반 추종' },
      { symbol: '455860', name: 'SOL 2차전지소부장Fn', sourceLabel: 'seed', quoteSymbol: '455860.KS', assetType: 'ETF', role: 'fallback_proxy', confidence: 82, reason: '소부장 보조 지표' },
    ],
  },
  {
    key: 'bio',
    name: '바이오/헬스케어',
    keywords: ['바이오', '헬스', 'bio', 'health', '제약'],
    anchors: [
      { symbol: '364970', name: 'TIGER 바이오TOP10', sourceLabel: 'seed', quoteSymbol: '364970.KS', assetType: 'ETF', role: 'core_etf', confidence: 95, reason: '바이오 대표 ETF' },
      { symbol: '266420', name: 'KODEX 헬스케어', sourceLabel: 'seed', quoteSymbol: '266420.KS', assetType: 'ETF', role: 'core_etf', confidence: 93, reason: '헬스케어 대표 ETF' },
      { symbol: '143860', name: 'TIGER 헬스케어', sourceLabel: 'seed', quoteSymbol: '143860.KS', assetType: 'ETF', role: 'theme_etf', confidence: 92, reason: '헬스케어 섹터 추종' },
      { symbol: '028300', name: 'HLB', sourceLabel: 'seed', quoteSymbol: '028300.KQ', assetType: 'STOCK', role: 'representative_stock', confidence: 85, reason: '국내 바이오 대표 관찰주' },
      { symbol: '214450', name: '파마리서치', sourceLabel: 'seed', quoteSymbol: '214450.KQ', assetType: 'STOCK', role: 'representative_stock', confidence: 84, reason: '헬스케어 대표 관찰주' },
    ],
  },
  {
    key: 'nuclear_energy',
    name: '원전/SMR/에너지',
    keywords: ['원전', 'smr', '원자력', '에너지', 'nuclear'],
    anchors: [
      { symbol: '434730', name: 'HANARO 원자력iSelect', sourceLabel: 'seed', quoteSymbol: '434730.KS', assetType: 'ETF', role: 'core_etf', confidence: 94, reason: '원전 대표 ETF' },
      { symbol: '433500', name: 'ACE 원자력테마딥서치', sourceLabel: 'seed', quoteSymbol: '433500.KS', assetType: 'ETF', role: 'theme_etf', confidence: 90, reason: '원자력 테마 ETF' },
      { symbol: '442320', name: 'KODEX K-원자력액티브', sourceLabel: 'seed', quoteSymbol: '442320.KS', assetType: 'ETF', role: 'theme_etf', confidence: 90, reason: '국내 원자력 액티브 ETF' },
      { symbol: 'URA', name: 'Global X Uranium ETF', sourceLabel: 'seed', market: 'US', googleTicker: 'NYSEARCA:URA', quoteSymbol: 'URA', assetType: 'ETF', role: 'core_etf', confidence: 88, reason: '글로벌 우라늄 ETF' },
      { symbol: 'NLR', name: 'VanEck Uranium+Nuclear Energy ETF', sourceLabel: 'seed', market: 'US', googleTicker: 'NYSEARCA:NLR', quoteSymbol: 'NLR', assetType: 'ETF', role: 'fallback_proxy', confidence: 82, reason: '원전 섹터 보조 ETF' },
    ],
  },
  {
    key: 'ai_power_infra',
    name: 'AI/전력인프라',
    keywords: ['ai', '전력', '인프라', '데이터센터', '인공지능'],
    anchors: [
      { symbol: '456600', name: 'TIMEFOLIO 글로벌AI인공지능액티브', sourceLabel: 'seed', quoteSymbol: '456600.KS', assetType: 'ETF', role: 'core_etf', confidence: 92, reason: 'AI 테마 대표 ETF' },
      { symbol: '466920', name: 'SOL 조선TOP3플러스', sourceLabel: 'seed', quoteSymbol: '466920.KS', assetType: 'ETF', role: 'fallback_proxy', confidence: 72, reason: '전력인프라와 일부 밸류체인 연동 proxy' },
      { symbol: '453450', name: '그리드위즈', sourceLabel: 'seed', quoteSymbol: '453450.KQ', assetType: 'STOCK', role: 'representative_stock', confidence: 84, reason: '스마트그리드 대표 관찰주' },
      { symbol: '267260', name: 'HD현대일렉트릭', sourceLabel: 'seed', quoteSymbol: '267260.KS', assetType: 'STOCK', role: 'representative_stock', confidence: 86, reason: '전력기기 대표 관찰주' },
      { symbol: '010120', name: 'LS ELECTRIC', sourceLabel: 'seed', quoteSymbol: '010120.KS', assetType: 'STOCK', role: 'representative_stock', confidence: 85, reason: '전력 인프라 대표 관찰주' },
    ],
  },
  {
    key: 'us_growth',
    name: '미국 성장/나스닥',
    keywords: ['나스닥', 's&p', '미국', 'nasdaq', 'sp500'],
    anchors: [
      { symbol: '133690', name: 'TIGER 미국나스닥100', sourceLabel: 'seed', quoteSymbol: '133690.KS', assetType: 'ETF', role: 'core_etf', confidence: 95, reason: '미국 성장 ETF' },
      { symbol: '379810', name: 'KODEX 미국나스닥100TR', sourceLabel: 'seed', quoteSymbol: '379810.KS', assetType: 'ETF', role: 'theme_etf', confidence: 92, reason: '나스닥100 TR' },
      { symbol: '360750', name: 'TIGER 미국S&P500', sourceLabel: 'seed', quoteSymbol: '360750.KS', assetType: 'ETF', role: 'theme_etf', confidence: 90, reason: '미국 대형주 분산' },
      { symbol: 'QQQ', name: 'Invesco QQQ Trust', sourceLabel: 'seed', market: 'US', googleTicker: 'NASDAQ:QQQ', quoteSymbol: 'QQQ', assetType: 'ETF', role: 'core_etf', confidence: 91, reason: '미국 나스닥 대표 ETF' },
      { symbol: 'SCHG', name: 'Schwab U.S. Large-Cap Growth ETF', sourceLabel: 'seed', market: 'US', googleTicker: 'NYSEARCA:SCHG', quoteSymbol: 'SCHG', assetType: 'ETF', role: 'fallback_proxy', confidence: 82, reason: '미국 성장주 보조 ETF' },
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
      { symbol: 'ETHA', name: 'iShares Ethereum Trust', sourceLabel: 'seed', market: 'US', googleTicker: 'ETHA' },
      { symbol: 'COIN', name: 'Coinbase Global Inc', sourceLabel: 'seed', market: 'US', googleTicker: 'NASDAQ:COIN' },
      { symbol: 'MSTR', name: 'MicroStrategy Inc', sourceLabel: 'seed', market: 'US', googleTicker: 'NASDAQ:MSTR' },
    ],
  },
  {
    key: 'defense_space',
    name: '방산/우주항공',
    keywords: ['방산', '우주', '항공', 'defense'],
    anchors: [
      { symbol: '449450', name: 'PLUS K방산', sourceLabel: 'seed', quoteSymbol: '449450.KS', assetType: 'ETF', role: 'core_etf', confidence: 90, reason: '국내 방산 대표 ETF' },
      { symbol: '463280', name: 'TIGER 우주방산', sourceLabel: 'seed', quoteSymbol: '463280.KS', assetType: 'ETF', role: 'theme_etf', confidence: 90, reason: '우주/방산 테마' },
      { symbol: '442550', name: 'KODEX K-방산', sourceLabel: 'seed', quoteSymbol: '442550.KS', assetType: 'ETF', role: 'theme_etf', confidence: 88, reason: '방산 보조 ETF' },
    ],
  },
  {
    key: 'shipping',
    name: '조선/해운',
    keywords: ['조선', '해운', 'shipping', '해양'],
    anchors: [
      { symbol: '466920', name: 'SOL 조선TOP3플러스', sourceLabel: 'seed', quoteSymbol: '466920.KS', assetType: 'ETF', role: 'core_etf', confidence: 93, reason: '조선 대표 ETF' },
      { symbol: '494670', name: 'TIGER 조선TOP10', sourceLabel: 'seed', quoteSymbol: '494670.KS', assetType: 'ETF', role: 'theme_etf', confidence: 90, reason: '조선 테마 ETF' },
      { symbol: '441540', name: 'HANARO Fn조선해운', sourceLabel: 'seed', quoteSymbol: '441540.KS', assetType: 'ETF', role: 'theme_etf', confidence: 88, reason: '조선/해운 종합 ETF' },
    ],
  },
  {
    key: 'k_content',
    name: 'K-콘텐츠/미디어',
    keywords: ['콘텐츠', '미디어', '엔터', 'media', 'entertainment'],
    anchors: [
      { symbol: '228810', name: 'TIGER 미디어컨텐츠', sourceLabel: 'seed', quoteSymbol: '228810.KS', assetType: 'ETF', role: 'core_etf', confidence: 95, reason: '국내 콘텐츠 대표 ETF' },
      { symbol: 'NFLX', name: 'Netflix', sourceLabel: 'seed', market: 'US', googleTicker: 'NASDAQ:NFLX', quoteSymbol: 'NFLX', assetType: 'STOCK', role: 'representative_stock', confidence: 88, reason: '글로벌 OTT proxy' },
      { symbol: 'DIS', name: 'Walt Disney', sourceLabel: 'seed', market: 'US', googleTicker: 'NYSE:DIS', quoteSymbol: 'DIS', assetType: 'STOCK', role: 'representative_stock', confidence: 84, reason: '글로벌 미디어 proxy' },
      { symbol: '035760', name: 'CJ ENM', sourceLabel: 'seed', quoteSymbol: '035760.KQ', assetType: 'STOCK', role: 'representative_stock', confidence: 85, reason: '국내 미디어 제작사 proxy' },
      { symbol: '253450', name: '스튜디오드래곤', sourceLabel: 'seed', quoteSymbol: '253450.KQ', assetType: 'STOCK', role: 'representative_stock', confidence: 85, reason: '국내 콘텐츠 제작사 proxy' },
    ],
  },
  {
    key: 'consumer_retail',
    name: '소비/유통',
    keywords: ['소비', '유통', '리테일', '편의점', '마트', '백화점'],
    anchors: [
      { symbol: '007070', name: 'GS리테일', sourceLabel: 'seed', quoteSymbol: '007070.KS', assetType: 'STOCK', role: 'representative_stock', confidence: 88, reason: '소비/유통 대표주' },
      { symbol: '282330', name: 'BGF리테일', sourceLabel: 'seed', quoteSymbol: '282330.KS', assetType: 'STOCK', role: 'representative_stock', confidence: 87, reason: '편의점 대표주' },
      { symbol: '139480', name: '이마트', sourceLabel: 'seed', quoteSymbol: '139480.KS', assetType: 'STOCK', role: 'representative_stock', confidence: 84, reason: '대형 유통 대표주' },
      { symbol: '023530', name: '롯데쇼핑', sourceLabel: 'seed', quoteSymbol: '023530.KS', assetType: 'STOCK', role: 'representative_stock', confidence: 82, reason: '백화점/유통 대표주' },
      { symbol: '266390', name: 'KODEX 경기소비재', sourceLabel: 'seed', quoteSymbol: '266390.KS', assetType: 'ETF', role: 'fallback_proxy', confidence: 75, reason: '소비재 ETF proxy' },
    ],
  },
  {
    key: 'airline_travel',
    name: '항공/여행',
    keywords: ['항공', '여행', '관광', 'lcc', '에어'],
    anchors: [
      { symbol: '091810', name: '티웨이항공', sourceLabel: 'seed', quoteSymbol: '091810.KS', assetType: 'STOCK', role: 'representative_stock', confidence: 88, reason: 'LCC 대표주' },
      { symbol: '003490', name: '대한항공', sourceLabel: 'seed', quoteSymbol: '003490.KS', assetType: 'STOCK', role: 'representative_stock', confidence: 87, reason: '국적항공 대표주' },
      { symbol: '272450', name: '진에어', sourceLabel: 'seed', quoteSymbol: '272450.KS', assetType: 'STOCK', role: 'representative_stock', confidence: 85, reason: 'LCC 대표주' },
      { symbol: '039130', name: '하나투어', sourceLabel: 'seed', quoteSymbol: '039130.KS', assetType: 'STOCK', role: 'representative_stock', confidence: 82, reason: '여행 수요 proxy' },
      { symbol: '080160', name: '모두투어', sourceLabel: 'seed', quoteSymbol: '080160.KQ', assetType: 'STOCK', role: 'fallback_proxy', confidence: 78, reason: '여행 보조 proxy' },
    ],
  },
  {
    key: 'finance_fintech',
    name: '금융/핀테크',
    keywords: ['금융', '핀테크', '은행', '카드', '증권', '뱅크'],
    anchors: [
      { symbol: '279570', name: '케이뱅크', sourceLabel: 'seed', quoteSymbol: '279570.KS', assetType: 'STOCK', role: 'fallback_proxy', confidence: 70, reason: 'ticker 검증 필요 가능성 있는 인터넷은행 proxy' },
      { symbol: '105560', name: 'KB금융', sourceLabel: 'seed', quoteSymbol: '105560.KS', assetType: 'STOCK', role: 'representative_stock', confidence: 88, reason: '국내 금융 대표주' },
      { symbol: '323410', name: '카카오뱅크', sourceLabel: 'seed', quoteSymbol: '323410.KS', assetType: 'STOCK', role: 'representative_stock', confidence: 85, reason: '인터넷은행 proxy' },
      { symbol: '377300', name: '카카오페이', sourceLabel: 'seed', quoteSymbol: '377300.KS', assetType: 'STOCK', role: 'representative_stock', confidence: 83, reason: '핀테크 proxy' },
      { symbol: '466940', name: 'TIGER 은행고배당플러스TOP10', sourceLabel: 'seed', quoteSymbol: '466940.KS', assetType: 'ETF', role: 'core_etf', confidence: 84, reason: '은행/배당 ETF' },
    ],
  },
  {
    key: 'cybersecurity',
    name: '사이버보안',
    keywords: ['사이버보안', '보안', '시큐리티', '클라우드 보안', '네트워크 보안'],
    anchors: [
      { symbol: 'PANW', name: 'Palo Alto Networks', sourceLabel: 'seed', market: 'US', googleTicker: 'NASDAQ:PANW', quoteSymbol: 'PANW', assetType: 'STOCK', role: 'representative_stock', confidence: 95, reason: '사이버보안 대표주' },
      { symbol: 'CRWD', name: 'CrowdStrike', sourceLabel: 'seed', market: 'US', googleTicker: 'NASDAQ:CRWD', quoteSymbol: 'CRWD', assetType: 'STOCK', role: 'representative_stock', confidence: 93, reason: '엔드포인트 보안 대표주' },
      { symbol: 'FTNT', name: 'Fortinet', sourceLabel: 'seed', market: 'US', googleTicker: 'NASDAQ:FTNT', quoteSymbol: 'FTNT', assetType: 'STOCK', role: 'representative_stock', confidence: 90, reason: '네트워크 보안 대표주' },
      { symbol: 'ZS', name: 'Zscaler', sourceLabel: 'seed', market: 'US', googleTicker: 'NASDAQ:ZS', quoteSymbol: 'ZS', assetType: 'STOCK', role: 'representative_stock', confidence: 88, reason: '클라우드 보안 대표주' },
      { symbol: 'HACK', name: 'ETFMG Prime Cyber Security ETF', sourceLabel: 'seed', market: 'US', googleTicker: 'NYSEARCA:HACK', quoteSymbol: 'HACK', assetType: 'ETF', role: 'core_etf', confidence: 88, reason: '사이버보안 ETF' },
    ],
  },
  {
    key: 'ev_autonomous',
    name: '전기차/자율주행',
    keywords: ['전기차', '자율주행', '배터리', '모빌리티', '테슬라'],
    anchors: [
      { symbol: 'TSLA', name: 'Tesla', sourceLabel: 'seed', market: 'US', googleTicker: 'NASDAQ:TSLA', quoteSymbol: 'TSLA', assetType: 'STOCK', role: 'representative_stock', confidence: 95, reason: '전기차 대표주' },
      { symbol: 'DRIV', name: 'Global X Autonomous & Electric Vehicles ETF', sourceLabel: 'seed', market: 'US', googleTicker: 'NASDAQ:DRIV', quoteSymbol: 'DRIV', assetType: 'ETF', role: 'core_etf', confidence: 90, reason: '전기차/자율주행 ETF' },
      { symbol: 'IDRV', name: 'iShares Self-Driving EV and Tech ETF', sourceLabel: 'seed', market: 'US', googleTicker: 'NYSEARCA:IDRV', quoteSymbol: 'IDRV', assetType: 'ETF', role: 'theme_etf', confidence: 88, reason: '자율주행 테마 ETF' },
      { symbol: 'RIVN', name: 'Rivian', sourceLabel: 'seed', market: 'US', googleTicker: 'NASDAQ:RIVN', quoteSymbol: 'RIVN', assetType: 'STOCK', role: 'fallback_proxy', confidence: 78, reason: 'EV 보조 proxy' },
      { symbol: '005380', name: '현대차', sourceLabel: 'seed', quoteSymbol: '005380.KS', assetType: 'STOCK', role: 'representative_stock', confidence: 86, reason: '국내 완성차 proxy' },
    ],
  },
  {
    key: 'etf_income',
    name: 'ETF/인컴',
    keywords: ['etf', '인컴', '커버드콜', '배당', 'kodex', 'tiger'],
    anchors: [
      { symbol: '498400', name: 'KODEX 200 타겟 위클리 커버드콜', sourceLabel: 'seed', quoteSymbol: '498400.KS', assetType: 'ETF', role: 'core_etf', confidence: 95, reason: '국내 인컴 ETF' },
      { symbol: '458730', name: 'TIGER 미국배당다우존스', sourceLabel: 'seed', quoteSymbol: '458730.KS', assetType: 'ETF', role: 'core_etf', confidence: 90, reason: '미국 배당 인컴 ETF' },
      { symbol: '446720', name: 'SOL 미국배당다우존스', sourceLabel: 'seed', quoteSymbol: '446720.KS', assetType: 'ETF', role: 'theme_etf', confidence: 88, reason: '배당 인컴 ETF' },
      { symbol: 'JEPI', name: 'JPMorgan Equity Premium Income ETF', sourceLabel: 'seed', market: 'US', googleTicker: 'NYSEARCA:JEPI', quoteSymbol: 'JEPI', assetType: 'ETF', role: 'core_etf', confidence: 88, reason: '미국 인컴 ETF' },
      { symbol: 'JEPQ', name: 'JPMorgan Nasdaq Equity Premium Income ETF', sourceLabel: 'seed', market: 'US', googleTicker: 'NASDAQ:JEPQ', quoteSymbol: 'JEPQ', assetType: 'ETF', role: 'theme_etf', confidence: 86, reason: '나스닥 인컴 ETF' },
    ],
  },
  {
    key: 'shipping_lng_material',
    name: '조선/LNG/소재',
    keywords: ['조선', 'lng', '보냉재', '소재', '해운'],
    anchors: [
      { symbol: '033500', name: '동성화인텍', sourceLabel: 'seed', googleTicker: 'KOSDAQ:033500', quoteSymbol: '033500.KQ', assetType: 'STOCK', role: 'representative_stock', confidence: 90, reason: 'LNG 보냉재 대표주' },
      { symbol: '009540', name: 'HD한국조선해양', sourceLabel: 'seed', quoteSymbol: '009540.KS', assetType: 'STOCK', role: 'representative_stock', confidence: 88, reason: '조선 대표주' },
      { symbol: '042660', name: '한화오션', sourceLabel: 'seed', quoteSymbol: '042660.KS', assetType: 'STOCK', role: 'representative_stock', confidence: 87, reason: '조선 대표주' },
      { symbol: '010140', name: '삼성중공업', sourceLabel: 'seed', quoteSymbol: '010140.KS', assetType: 'STOCK', role: 'representative_stock', confidence: 85, reason: '조선 대형주 proxy' },
      { symbol: '466920', name: 'SOL 조선TOP3플러스', sourceLabel: 'seed', quoteSymbol: '466920.KS', assetType: 'ETF', role: 'core_etf', confidence: 88, reason: '조선 ETF' },
    ],
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

function inferKrTickerPrefix(seed: SectorRadarAnchorSeed): 'KRX' | 'KOSDAQ' {
  const quote = (seed.quoteSymbol ?? '').toUpperCase();
  if (quote.endsWith('.KQ')) return 'KOSDAQ';
  return 'KRX';
}

function resolveSeedGoogleTicker(seed: SectorRadarAnchorSeed): { market: SectorRadarMarket; ticker: string; symbolNorm: string } {
  const market: SectorRadarMarket = seed.market ?? 'KR';
  const symbolNorm = normalizedSectorSymbol(market, seed.symbol);
  const fallbackTicker = market === 'KR'
    ? `${inferKrTickerPrefix(seed)}:${padKrSymbol(seed.symbol)}`
    : symbolNorm;
  const ticker = (seed.googleTicker?.trim() || fallbackTicker).toUpperCase();
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

export function getSectorKeyBySectorName(name: string | null | undefined): string | null {
  const hs = normalizeSectorLabelForLookup(name);
  if (!hs) return null;
  const alias = getSectorKeyByAliasName(hs);
  if (alias) return alias;
  const cat = SECTOR_RADAR_CATEGORY_SEEDS.find((c) => normLower(c.name) === hs || hs.includes(normLower(c.name)));
  return cat?.key ?? null;
}

export function listRelatedAnchorsBySectorName(name: string | null | undefined, limit = 5): SectorRadarAnchorAsset[] {
  const key = getSectorKeyBySectorName(name);
  if (!key) return [];
  const cat = SECTOR_RADAR_CATEGORY_SEEDS.find((c) => c.key === key);
  if (!cat) return [];
  return cat.anchors.slice(0, Math.max(1, Math.min(5, limit))).map((a) => {
    const market = a.market ?? 'KR';
    const symbol = `${market}:${normalizedSectorSymbol(market, a.symbol)}`;
    const googleTicker = (a.googleTicker?.trim() || (market === 'KR' ? `KRX:${normalizedSectorSymbol(market, a.symbol)}` : normalizedSectorSymbol(market, a.symbol))).toUpperCase();
    return {
      name: a.name,
      market,
      assetType: a.assetType ?? 'ETF',
      symbol,
      googleTicker,
      quoteSymbol: a.quoteSymbol,
      role: a.role ?? 'fallback_proxy',
      confidence: a.confidence ?? 70,
      reason: a.reason ?? 'sector anchor seed',
    };
  });
}

/** 관심종목 텍스트·섹터 필드로 매칭되는 sector_radar 카테고리 키 목록 */
export function listSectorKeysMatchingWatchlist(row: WebPortfolioWatchlistRow): string[] {
  const blob = watchlistTextBlob(row);
  const hs = normLower(row.sector);
  const out = new Set<string>();
  const alias = getSectorKeyByAliasName(hs);
  if (alias) out.add(alias);
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

/** 관심종목별로 레지스트리 섹터 키가 몇 번 연결되는지 집계(동일 종목이 여러 섹터와 맞을 수 있음). */
export function countLinkedWatchlistBySector(watchlist: WebPortfolioWatchlistRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of watchlist) {
    for (const k of listSectorKeysMatchingWatchlist(row)) {
      counts[k] = (counts[k] ?? 0) + 1;
    }
  }
  return counts;
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
