/**
 * EVO-007: 테마 연결 맵(관찰·설명·진단용). 매수 추천·자동매매·후보 강제 생성 아님.
 */

export type ThemeLinkConfidence = 'high' | 'medium' | 'low' | 'missing';

export type ThemeLinkSource =
  | 'sector_radar'
  | 'watchlist'
  | 'portfolio_holding'
  | 'today_candidate'
  | 'us_signal'
  | 'manual_map';

export type ThemeLinkedInstrument = {
  symbol: string;
  name?: string;
  market?: 'KR' | 'US' | 'ETF' | 'UNKNOWN';
  type: 'stock' | 'etf' | 'index' | 'unknown';
  source: ThemeLinkSource;
  confidence: ThemeLinkConfidence;
  reason: string;
};

export type ThemeConnectionMapItem = {
  themeKey: string;
  themeLabel: string;
  representativeEtf?: ThemeLinkedInstrument;
  linkedInstruments: ThemeLinkedInstrument[];
  confidence: ThemeLinkConfidence;
  warnings?: string[];
};

/** primaryCandidateDeck 카드에 붙는 1차 테마 연결 요약. */
export type ThemeConnectionCandidateBinding = {
  themeKey: string;
  themeLabel: string;
  confidence: ThemeLinkConfidence;
  reason: string;
};

export type ThemeConnectionSummary = {
  mappedThemeCount: number;
  linkedInstrumentCount: number;
  confidenceCounts: { high: number; medium: number; low: number; missing: number };
  /** registry 대비 linked가 비어 있거나 confidence가 missing인 테마 수 */
  missingThemeCount: number;
};
