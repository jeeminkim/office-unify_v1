/** Today Brief 관찰 후보 카드 — 사용자 표시용 지표(Sector Radar 스타일). */

export type TodayCandidateScoreLabel = '높음' | '보통' | '낮음' | '데이터 부족';

export type TodayCandidateConfidenceLabel = '높음' | '보통' | '낮음';

export type TodayCandidateDisplayMetrics = {
  observationScore: number;
  scoreLabel: TodayCandidateScoreLabel;
  confidenceLabel: TodayCandidateConfidenceLabel;
  dataQualityLabel: string;
  relationLabel: string;
  primaryRiskLabel?: string;
  scoreExplanation: string;
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
