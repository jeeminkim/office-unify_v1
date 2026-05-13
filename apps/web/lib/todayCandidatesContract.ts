import type {
  ConcentrationRiskAssessment,
  ObservationScoreFactorCode,
  SuitabilityAssessment,
  ThemeConnectionCandidateBinding,
  ThemeConnectionMapItem,
  ThemeConnectionSummary,
  TodayCandidateDisplayMetrics,
  TodayBriefConcentrationRiskSummary,
  TodayBriefDeckSlot,
  UsKrSignalEmptyReasonCode,
} from '@office-unify/shared-types';

export type TodayCandidateSource =
  | 'user_context'
  | 'watchlist'
  | 'sector_radar'
  | 'trend_memory'
  | 'us_market_morning'
  | 'manual_rule'
  | 'fallback';

export type TodayCandidateRiskLevel = 'low' | 'medium' | 'high' | 'unknown';

export type TodayCandidateDataQualityReasonCode =
  | 'quote_ready'
  | 'quote_missing'
  | 'sector_confirmed'
  | 'sector_low_confidence'
  | 'us_market_available'
  | 'us_market_no_data'
  | 'watchlist_connected'
  | 'watchlist_not_connected'
  | 'overheated_risk'
  | 'chasing_risk'
  | 'surge_risk'
  | 'low_confidence'
  | 'very_low_confidence';

export interface TodayCandidateDataQualityReason {
  code: TodayCandidateDataQualityReasonCode;
  message: string;
  severity: 'positive' | 'neutral' | 'warning' | 'risk';
}

export interface TodayCandidatePrimaryRisk {
  code:
    | 'overheated_risk'
    | 'chasing_risk'
    | 'surge_risk'
    | 'quote_missing'
    | 'us_market_no_data'
    | 'sector_low_confidence'
    | 'low_confidence'
    | 'very_low_confidence';
  label: string;
  message: string;
  severity: 'warning' | 'risk';
}

export interface TodayCandidateDataQuality {
  overall: 'high' | 'medium' | 'low' | 'very_low';
  badges: string[];
  reasons: string[];
  reasonItems?: TodayCandidateDataQualityReason[];
  primaryRisk?: TodayCandidatePrimaryRisk;
  summary?: string;
  quoteReady?: boolean;
  sectorConfidence?: 'high' | 'medium' | 'low' | 'very_low' | 'unknown';
  usMarketDataAvailable?: boolean;
  warnings: string[];
}

export interface TodayStockCandidate {
  candidateId: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ' | 'KONEX' | 'US' | 'UNKNOWN';
  country: 'KR' | 'US' | 'UNKNOWN';
  symbol?: string;
  stockCode?: string;
  googleTicker?: string;
  quoteSymbol?: string;
  sector?: string;
  source: TodayCandidateSource;
  score: number;
  confidence: 'high' | 'medium' | 'low' | 'very_low';
  riskLevel: TodayCandidateRiskLevel;
  reasonSummary: string;
  reasonDetails: string[];
  positiveSignals: string[];
  cautionNotes: string[];
  relatedUserContext: string[];
  relatedWatchlistSymbols: string[];
  relatedUsMarketSignals?: string[];
  isBuyRecommendation: false;
  alreadyInWatchlist?: boolean;
  watchlistItemId?: string;
  dataQuality?: TodayCandidateDataQuality;
  /** Additive: 메인 3카드(관심 2 + Sector ETF 1) 슬롯. */
  briefDeckSlot?: TodayBriefDeckSlot;
  /** Additive: 카드 표시용 해석 지표(내부 raw score 대신). */
  displayMetrics?: TodayCandidateDisplayMetrics;
  /** Additive: Sector ETF 카드 부제·테마 안내. */
  sectorEtfThemeHint?: string;
  /** Additive: 투자자 프로필 기반 적합성(관찰·판단 보조). */
  suitabilityAssessment?: SuitabilityAssessment;
  /** Additive: EVO-005 보유·테마 집중도(자동 리밸런싱 아님). */
  concentrationRiskAssessment?: ConcentrationRiskAssessment;
  /** EVO-007: 테마 연결 진단(관찰·설명용, 후보 강제 생성 아님). */
  themeConnection?: ThemeConnectionCandidateBinding;
}

export interface UsMarketMorningSummary {
  asOfKst: string;
  available: boolean;
  conclusion: 'risk_on' | 'risk_off' | 'mixed' | 'sector_rotation' | 'no_data';
  summary: string;
  signals: Array<{
    signalKey: string;
    label: string;
    direction: 'positive' | 'negative' | 'mixed' | 'neutral';
    confidence: 'high' | 'medium' | 'low';
    evidence: string[];
  }>;
  warnings: string[];
  /** Additive: 빈 화면/운영 진단용(민감정보 없음). */
  diagnostics?: {
    yahooQuoteResultCount: number;
    anchorSymbolsRequested: number;
    fetchFailed: boolean;
    representativeAnchors?: Array<{ key: string; label: string; quoteSymbol: string }>;
  };
}

export interface TodayBriefWithCandidatesResponse {
  ok: boolean;
  generatedAt: string;
  lines: Array<{
    title: string;
    body: string;
    severity: 'info' | 'warn' | 'danger' | 'positive';
    source: string[];
  }>;
  badges: string[];
  degraded?: boolean;
  warnings?: string[];
  candidates?: {
    userContext: TodayStockCandidate[];
    usMarketKr: TodayStockCandidate[];
  };
  /** Additive: 관심사 상위 2 + Sector 대표 ETF 1 구성의 메인 덱(최대 3). */
  primaryCandidateDeck?: TodayStockCandidate[];
  /** Additive: 미국 신호 → 한국 매핑 후보가 비었을 때 사용자/운영용 진단. */
  usKrSignalDiagnostics?: {
    primaryReason: UsKrSignalEmptyReasonCode;
    userMessage: string;
    reasonCodes: UsKrSignalEmptyReasonCode[];
    debugHints?: string[];
  };
  usMarketSummary?: UsMarketMorningSummary;
  disclaimer?: string;
  qualityMeta?: {
    todayCandidates: {
      generatedAt: string;
      userContextCount: number;
      usMarketKrCount: number;
      usMarketDataAvailable: boolean;
      highConfidenceCount?: number;
      mediumConfidenceCount?: number;
      lowConfidenceCount?: number;
      veryLowConfidenceCount?: number;
      postProcess?: {
        successCount: number;
        partialCount: number;
        failedCount: number;
        warnings: string[];
      };
      opsLogging?: {
        attempted: number;
        written: number;
        skippedReadOnly: number;
        skippedCooldown: number;
        skippedBudgetExceeded: number;
        warnings: string[];
        /** Additive: last N ops write decisions (whitelist-gated read-only events). */
        eventTrace?: Array<{ code: string; shouldWrite: boolean; reason: string }>;
      };
      warnings: string[];
      /** Additive: primaryCandidateDeck 구성 메타. */
      composition?: {
        interestCandidateCount: number;
        sectorRadarEtfCandidateCount: number;
        usSignalCandidateCount: number;
        selectedInterestCount: number;
        selectedSectorEtfCount: number;
        selectionPolicy: string;
        fallbackReason?: string;
        droppedReasons: string[];
      };
      /** Additive: 7일 요약용 — 최근 empty reason 분포(코드 → 건수). */
      usKrEmptyReasonHistogram?: Partial<Record<UsKrSignalEmptyReasonCode, number>>;
      sectorEtfFallbackCount?: number;
      /** Additive: 적합성 게이트 요약(Today Brief 덱). */
      suitability?:
        | {
            profileStatus: 'missing' | 'partial' | 'complete';
            warningCounts: Partial<Record<string, number>>;
          }
        | { skipped: true; reason: string };
      /** Additive: EVO-002 관찰 점수 설명 요약(민감정보·원문 노트 없음). */
      scoreExplanationSummary?: {
        explainedCandidateCount: number;
        factorCounts: Partial<Record<ObservationScoreFactorCode, number>>;
        profileStatus: 'missing' | 'partial' | 'complete';
      };
      /** Additive: EVO-005 집중도 요약(금액·티커 원문 없음). */
      concentrationRiskSummary?: TodayBriefConcentrationRiskSummary;
      /** Additive: EVO-007 테마 연결 맵 요약(민감 원문 없음). */
      themeConnectionSummary?: ThemeConnectionSummary;
      /** Additive: EVO-007 테마별 연결(소량 registry 기반). */
      themeConnectionMap?: ThemeConnectionMapItem[];
      /** Additive: EVO-007 + EVO-006 — usToKrMappingEmpty일 때 테마 맵 얇음 안내. */
      usKrEmptyThemeBridgeHint?: string;
    };
  };
}
