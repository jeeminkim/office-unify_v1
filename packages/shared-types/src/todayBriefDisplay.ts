/** Today Brief 관찰 후보 카드 — 사용자 표시용 지표(Sector Radar 스타일). */

export type TodayCandidateScoreLabel = '높음' | '보통' | '낮음' | '데이터 부족';

export type TodayCandidateConfidenceLabel = '높음' | '보통' | '낮음';

/** EVO-002: 관찰 점수를 사용자 이해용 요인으로 분해(매수 권유·자동 실행과 무관). */
export type ObservationScoreFactorCode =
  | 'interest_match'
  | 'watchlist_match'
  | 'sector_radar_match'
  | 'quote_quality'
  | 'us_market_signal'
  | 'suitability_adjustment'
  | 'risk_penalty'
  | 'data_quality_penalty'
  | 'freshness_penalty'
  | 'diversity_adjustment'
  /** EVO-005: 보유·테마 집중도 참고(자동 리밸런싱 아님). */
  | 'portfolio_concentration'
  /** EVO-007: 초기 registry·Sector Radar 기반 테마 연결 설명(후보 강제 생성 아님). */
  | 'theme_link'
  | 'unknown';

export type ObservationScoreFactor = {
  code: ObservationScoreFactorCode;
  label: string;
  direction: 'positive' | 'negative' | 'neutral';
  /** 정확 산식이 없으면 생략 가능 */
  points?: number;
  message: string;
};

export type ObservationScoreExplanation = {
  /** 적합성 등 조정 전 관찰 점수(가능할 때만) */
  baseScore?: number;
  finalScore: number;
  factors: ObservationScoreFactor[];
  summary: string;
  caveat: string;
};

export type TodayCandidateDisplayMetrics = {
  observationScore: number;
  scoreLabel: TodayCandidateScoreLabel;
  confidenceLabel: TodayCandidateConfidenceLabel;
  dataQualityLabel: string;
  relationLabel: string;
  primaryRiskLabel?: string;
  scoreExplanation: string;
  /** Additive: 요인별 관찰 점수 맥락(EVO-002). */
  scoreExplanationDetail?: ObservationScoreExplanation;
};

/** 메인 3카드 슬롯(관심사 2 + Sector ETF 1). */
export type TodayBriefDeckSlot = 'interest_stock' | 'sector_etf';

/**
 * 미국장 신호 → 한국 후보가 비었을 때 진단 코드(qualityMeta / ops).
 * additive — 기존 warnings 문자열과 병행.
 */
export type UsKrSignalEmptyReasonCode =
  | 'usMarketDataMissing'
  | 'usSignalProviderDisabled'
  | 'usQuoteMissing'
  | 'usToKrMappingEmpty'
  | 'staleUsData'
  | 'insufficientSignalScore'
  | 'marketClosedNoRecentData'
  | 'unknown';
