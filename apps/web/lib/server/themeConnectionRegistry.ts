/**
 * EVO-007 초기 휴리스틱 registry — **연결 설명·진단용**이며 매수 후보 추천 리스트가 아님.
 * 키워드 매칭은 한국어/영문 혼합 substring 수준이다.
 */
export type ThemeRegistryEntry = {
  themeKey: string;
  themeLabel: string;
  /** 대표 ETF 심볼(US, 대문자). Sector Radar 앵커와 교차 확인용. */
  representativeEtfSymbols?: string[];
  /** watchlist·보유·후보 텍스트 매칭용(소문자 비교). */
  keywords: string[];
};

export const THEME_CONNECTION_REGISTRY: readonly ThemeRegistryEntry[] = [
  {
    themeKey: 'ai_power_infra',
    themeLabel: 'AI/전력 인프라',
    representativeEtfSymbols: ['BOTZ', 'SMH', 'SOXX', 'XLK'],
    keywords: ['ai', '전력', '전력기기', '데이터센터', '원전', '변압기', '반도체', '인프라', 'power', 'data center'],
  },
  {
    themeKey: 'k_nuclear',
    themeLabel: 'K-원자력',
    representativeEtfSymbols: ['URA', 'NLR'],
    keywords: ['원전', '원자력', 'smr', '두산에너빌리티', 'nuclear'],
  },
  {
    themeKey: 'shipbuilding',
    themeLabel: '조선',
    representativeEtfSymbols: [],
    keywords: ['조선', 'lng선', 'lng', '방산함정', '해양', 'ship'],
  },
  {
    themeKey: 'biotech',
    themeLabel: '바이오/플랫폼',
    representativeEtfSymbols: ['XBI', 'IBB'],
    keywords: ['바이오', 'sc제형', '항체', '임상', 'bio', 'platform', '제약'],
  },
] as const;
