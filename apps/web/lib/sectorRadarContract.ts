/** Sector Fear & Greed Radar — API/클라이언트 공유 계약 (서버 전용 import 불필요). */

export type SectorRadarZone =
  | "extreme_fear"
  | "fear"
  | "neutral"
  | "greed"
  | "extreme_greed"
  | "no_data";

export type SectorRadarActionHint =
  | "buy_watch"
  | "accumulate"
  | "hold"
  | "trim_watch"
  | "avoid_chase"
  | "no_data";

export type SectorRadarAnchorDataStatus = "ok" | "pending" | "empty" | "parse_failed";

export type SectorRadarSummaryAnchor = {
  symbol: string;
  name: string;
  googleTicker: string;
  sourceLabel: "seed" | "watchlist";
  price?: number;
  volume?: number;
  changePct?: number;
  high52?: number;
  low52?: number;
  volumeAvg?: number;
  dataStatus: SectorRadarAnchorDataStatus;
};

/** 사용자-facing 온도 라벨(판단 보조·관찰용). 기존 `zone`(fear/greed…)과 별개로 표시용 해석에 씁니다. */
export type SectorRadarTemperature =
  | "NO_DATA"
  | "관망"
  | "중립"
  | "관심"
  | "과열"
  | "위험";

/** 표본·시세 커버리지 기반 데이터 신뢰도 (점수 해석용) */
export type SectorRadarConfidence = "high" | "medium" | "low" | "very_low";

export type SectorRadarScoreBreakdown = {
  momentum: number;
  volume: number;
  week52Position: number;
  trend: number;
  quality: number;
};

export type SectorRadarScoreQuality = {
  sampleCount: number;
  quoteOkCount: number;
  quoteMissingCount: number;
  quoteCoverageRatio: number;
  dataReliability: SectorRadarConfidence;
  confidencePenalty: number;
  warnings: string[];
};

export type SectorRadarScoreExplanation = {
  rawScore: number | null;
  adjustedScore: number | null;
  temperature: SectorRadarTemperature;
  confidence: SectorRadarConfidence;
  breakdown: SectorRadarScoreBreakdown | null;
  quality: SectorRadarScoreQuality;
  summary: string;
  interpretation: string;
  conservativeActionHint: string;
  mainDrivers: string[];
  riskNotes: string[];
  watchlistConnectionSummary?: string;
};

export type SectorRadarQualityMeta = {
  sectorRadar: {
    totalSectors: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    veryLowConfidence: number;
    noDataCount: number;
    quoteMissingSectors: number;
    overheatedSectors: number;
    warnings: string[];
    opsLogging?: {
      attempted: number;
      written: number;
      skippedReadOnly: number;
      skippedCooldown: number;
      skippedBudgetExceeded: number;
      warnings: string[];
    };
  };
};

export type SectorRadarSummarySector = {
  key: string;
  name: string;
  /** 기존 산식 그대로의 점수(하위 호환). 보수 보정 전 값입니다. */
  score?: number;
  /** `score`와 동일 의미(명시적 필드). */
  rawScore?: number;
  /** 표본 수·시세 성공률 등 신뢰도 패널티 반영 보수 점수. */
  adjustedScore?: number;
  zone: SectorRadarZone;
  actionHint: SectorRadarActionHint;
  narrativeHint: string;
  sampleCount?: number;
  quoteOkCount?: number;
  quoteMissingCount?: number;
  anchors: SectorRadarSummaryAnchor[];
  components: {
    momentum?: number;
    volume?: number;
    drawdown?: number;
    trend?: number;
    risk?: number;
    /** crypto 전용 서브스코어(0~100 스케일 가중 평균용) */
    cryptoBtc?: number;
    cryptoAlt?: number;
    cryptoInfra?: number;
  };
  /** 서버 내부 경고 코드(snake_case 등). UI 기본 노출 금지 — displayWarnings 사용. */
  warnings: string[];
  /** 사용자용 짧은 문구(카드 하단 등). 없거나 raw가 섞이면 `getVisibleSectorRadarWarningsForSector`가 `warnings`를 변환해 사용. */
  displayWarnings?: string[];
  /** tooltip·상세용 긴 문구(displayWarnings와 동일 순서). */
  displayWarningDetails?: string[];
  /** 점수 해석·신뢰도·보수적 안내(선택). */
  scoreExplanation?: SectorRadarScoreExplanation;
};

export type SectorRadarSummaryResponse = {
  ok: boolean;
  degraded?: boolean;
  generatedAt: string;
  sectors: SectorRadarSummarySector[];
  warnings: string[];
  displayWarnings?: string[];
  displayWarningDetails?: string[];
  fearCandidatesTop3: SectorRadarSummarySector[];
  greedCandidatesTop3: SectorRadarSummarySector[];
  /** 섹터 점수 품질 요약(선택). */
  qualityMeta?: SectorRadarQualityMeta;
};

export type SectorRadarStatusRow = {
  categoryKey: string;
  market?: "KR" | "US";
  anchorSymbol: string;
  googleTicker: string;
  rawPrice?: string;
  parsedPrice?: number;
  rawVolume?: string;
  parsedVolume?: number;
  rawVolumeAvg?: string;
  parsedVolumeAvg?: number;
  rawChangePct?: string;
  parsedChangePct?: number;
  rowStatus: SectorRadarAnchorDataStatus;
  message: string;
};

/** Dossier 등에서 단일 픽 요약 (additive). */
export type PortfolioDossierRelatedSector = {
  key: string;
  name: string;
  score?: number;
  zone: SectorRadarZone;
  confidence: "low" | "medium" | "high";
  narrativeHint: string;
  anchors: SectorRadarSummaryAnchor[];
};

export type SectorRadarStatusResponse = {
  ok: boolean;
  total: number;
  okCount: number;
  pendingCount: number;
  emptyCount: number;
  rows: SectorRadarStatusRow[];
  warnings: string[];
};

export type SectorWatchlistCandidateReadinessLabel =
  | "watch_now"
  | "prepare"
  | "hold_watch"
  | "wait"
  | "no_data";

export type SectorWatchlistCandidateItem = {
  sectorKey: string;
  sectorName: string;
  sectorScore?: number;
  sectorZone: SectorRadarZone;
  symbol: string;
  market: string;
  name: string;
  priority?: string;
  interestReason?: string;
  observationPoints?: string;
  desiredBuyRange?: string;
  googleTicker?: string;
  quoteSymbol?: string;
  readinessScore: number;
  readinessLabel: SectorWatchlistCandidateReadinessLabel;
  reasons: string[];
  confidence: "low" | "medium" | "high";
};

export type SectorWatchlistCandidateResponse = {
  ok: boolean;
  generatedAt: string;
  candidates: SectorWatchlistCandidateItem[];
  warnings: string[];
  displayWarnings?: string[];
  displayWarningDetails?: string[];
};
