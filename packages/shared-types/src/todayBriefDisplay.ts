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
  /** 데이터가 부족해 기본·중립 점수 근처에 머문 경우를 명시한다. */
  | 'data_default_hold'
  /** 최근 동일 후보 노출 진단(점수 인위 조작 없이 설명용). */
  | 'repeat_exposure'
  | 'unknown';

export type ObservationScoreFactor = {
  code: ObservationScoreFactorCode;
  label: string;
  direction: 'positive' | 'negative' | 'neutral';
  /** 정확 산식이 없으면 생략 가능 */
  points?: number;
  message: string;
};

export type ObservationScoreRepeatExposureSource =
  | 'exposed_event'
  | 'detail_opened_fallback'
  | 'none';

export type ObservationScoreRepeatExposure = {
  candidateRepeatCount7d: number;
  lastShownAt?: string;
  repeatedCandidate: boolean;
  repeatReason: string;
  /** 저신뢰 후보를 강제로 끌어올리지 않고, 반복 노출만 진단·힌트로 남긴다. */
  diversityPolicyNote?: string;
  /** 7일 반복 카운트 산출 경로: 브리핑 덱 노출 스냅샷 이벤트 우선, 없으면 상세 열람 로그. */
  source?: ObservationScoreRepeatExposureSource;
};

export type ObservationScoreDiagnostics = {
  /** 시세 검증이 부족해 가점/감점을 제한했는지 */
  needsQuoteVerification?: boolean;
  needsSectorVerification?: boolean;
  watchlistLinked?: boolean;
  profileOrConcentrationAdjusted?: boolean;
  /** 최종 점수가 중립대(기본 관찰 근처)인지 */
  neutralScoreBand?: boolean;
  /** 데이터 부족으로 강한 조정을 하지 않았는지 */
  defaultScoreHold?: boolean;
};

/** 관찰 점수 산출 분해(매수 권유·자동 실행과 무관). additive */
export type TodayCandidateScoreBreakdown = {
  baseScore: number;
  watchlistBoost: number;
  sectorBoost: number;
  usSignalBoost: number;
  quoteQualityPenalty: number;
  repeatExposurePenalty: number;
  corporateActionPenalty: number;
  riskPenalty: number;
  finalScore: number;
};

export type TodayCandidateCardKind =
  | 'watchlist_observation'
  | 'sector_representative'
  | 'us_signal_mapped'
  | 'risk_review';

/** 카드 상단 데이터 상태(요약 라벨). */
export type TodayCandidateDataStatusUi =
  | 'ok'
  | 'partial_sparse'
  | 'us_data_missing'
  | 'quote_verify_needed';

export type ObservationScoreExplanation = {
  /** 적합성 등 조정 전 관찰 점수(가능할 때만) */
  baseScore?: number;
  finalScore: number;
  factors: ObservationScoreFactor[];
  summary: string;
  caveat: string;
  /** 카드 상단 한 줄 요약 대신(또는 병행) 사용자 문장형 설명 */
  userReadableSummary?: string;
  diagnostics?: ObservationScoreDiagnostics;
  repeatExposure?: ObservationScoreRepeatExposure;
  /** qualityMeta 집계용 짧은 코드(원문·메모 없음) */
  scoreDefaultReasons?: string[];
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
  /** Additive: 점수 분해(품질·반복·리스크 감점 추적). */
  scoreBreakdown?: TodayCandidateScoreBreakdown;
  /** Additive: 후보 유형(관찰·복기용). */
  candidateCardKind?: TodayCandidateCardKind;
  /** Additive: 데이터 상태 요약. */
  dataStatusUi?: TodayCandidateDataStatusUi;
  /** Additive: 반복 노출(7일 스냅샷·노출 이벤트 기준). */
  repeatedExposure?: boolean;
  /** Additive: 주요 감점·주의 한 줄(중복 문구 제거 후). */
  mainDeductionLabels?: string[];
  /** Additive: 중립 관찰대(추천 톤 완화). */
  neutralObservationCopy?: string;
};

/** 메인 3카드 슬롯(관심 + 섹터 ETF + 미국 신호 매핑·리스크 점검). */
export type TodayBriefDeckSlot =
  | 'interest_stock'
  | 'sector_etf'
  | 'us_signal_kr'
  | 'risk_review';

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
