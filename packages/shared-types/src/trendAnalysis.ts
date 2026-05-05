/**
 * Trend Analysis Center — /trend 전용 (persona-chat registry와 분리)
 */

export type TrendReportMode = 'weekly' | 'monthly';

export type TrendHorizon = '7d' | '30d' | '90d';

export type TrendGeo = 'KR' | 'US' | 'GLOBAL';

export type TrendSectorFocus =
  | 'media'
  | 'entertainment'
  | 'sports'
  | 'special_experience'
  | 'fandom'
  | 'taste_identity'
  | 'all';

export type TrendOutputFocus = 'hot_now' | 'structural_change' | 'beneficiaries' | 'portfolio_mapping';

export type TrendConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW_CONFIDENCE' | 'NO_DATA';

export type TrendProvider = 'auto' | 'openai' | 'gemini';

export type TrendAnalysisGenerateRequestBody = {
  mode: TrendReportMode;
  horizon: TrendHorizon;
  geo: TrendGeo;
  sectorFocus: TrendSectorFocus[];
  focus: TrendOutputFocus;
  includePortfolioContext?: boolean;
  /** 선택: 운영 시트 append (환경 설정 시) */
  appendToSheets?: boolean;
  userPrompt?: string;
  /** 기본 auto — OpenAI 리서치 도구 vs Gemini만 */
  provider?: TrendProvider;
  /** 명시적 웹 검색(Responses API web_search) */
  useWebSearch?: boolean;
  /** 파일이 있을 때만 code_interpreter */
  useDataAnalysis?: boolean;
  /** OpenAI Files API file-xxx (선택) */
  attachedFileIds?: string[];
  /** 최신성 우선(자동 라우팅 힌트) */
  preferFreshness?: boolean;
  /** 기본 true — 기존 SQL memory topics/runs를 읽어 delta 비교 */
  includeMemoryContext?: boolean;
  /** 기본 true — trend_report_runs / topics / signals에 기록 (테이블 없으면 생략) */
  saveToSqlMemory?: boolean;
};

export type TrendBeneficiariesBlock = {
  direct: string;
  indirect: string;
  infrastructure: string;
};

export type TrendSectionBlock = {
  id: string;
  title: string;
  body: string;
};

/** UI·메타용 구조화 출처 (리포트 8번 섹션 문자열과 별도) */
export type TrendCitation = {
  title?: string;
  url?: string;
  snippet?: string;
  sourceType: 'web' | 'internal' | 'data_analysis' | 'unknown';
  freshnessNote?: string;
};

export type TrendToolUsage = {
  webSearchUsed: boolean;
  dataAnalysisUsed: boolean;
  fileCountAnalyzed: number;
  sourceCount: number;
};

/** 응답 freshness 요약 (source pack의 내부 메타와 합성) */
export type TrendFreshnessMetaOut = {
  horizon: string;
  geo: string;
  note: string;
  /** OpenAI 도구로 외부 최신성 보강 여부 */
  openAiResearchApplied: boolean;
  /** 내부 상수·원장만으로 제한된 경우 */
  internalContextOnly: boolean;
};

export type TrendResearchLayer = 'none' | 'openai_responses';

export type TrendTimeBucket =
  | 'fresh_30d'
  | 'medium_6_12m'
  | 'historical_reference'
  | 'long_term_thesis'
  | 'unknown';

export type TrendSourceGrade = 'A' | 'B' | 'C' | 'D' | 'UNKNOWN';

export type BeneficiarySensitivity =
  | 'primary_sensitive'
  | 'secondary_sensitive'
  | 'mega_cap_low_sensitivity'
  | 'watch_only';

export interface TrendTimeCheckResult {
  ok: boolean;
  warnings: string[];
  hasFresh30dSection: boolean;
  hasHistoricalReferenceSection: boolean;
  hasLongTermThesisSection: boolean;
}

export interface TrendSourceItem {
  title?: string;
  url?: string;
  publisher?: string;
  publishedAt?: string;
}

export interface TrendSourceQualityResult {
  source: TrendSourceItem;
  grade: TrendSourceGrade;
  reason: string;
  isPrimaryEnoughForInvestment: boolean;
}

export interface TrendTickerValidationResult {
  companyName: string;
  inputTicker?: string;
  normalizedYahooTicker?: string;
  normalizedGoogleTicker?: string;
  status: 'validated' | 'corrected' | 'ambiguous' | 'unknown';
  warning?: string;
}

export interface TrendScoreItem {
  key:
    | 'recurring_payment'
    | 'ip_expansion'
    | 'pricing_power'
    | 'humanity_intensity'
    | 'monetization_durability';
  score: 1 | 2 | 3 | 4 | 5;
  label: '낮음' | '보통' | '높음';
  evidence: string[];
  confidence: 'low' | 'medium' | 'high';
  caveat?: string;
}

export interface TrendMemorySignal {
  signalKey: string;
  name: string;
  summary: string;
  timeBucket: TrendTimeBucket;
  direction?: 'positive' | 'negative' | 'mixed' | 'neutral';
  confidence: 'low' | 'medium' | 'high';
  sourceGrades: TrendSourceGrade[];
  evidence: Array<{
    title?: string;
    url?: string;
    publisher?: string;
    publishedAt?: string;
    grade?: TrendSourceGrade;
  }>;
}

export interface TrendBeneficiary {
  companyName: string;
  relationship: string;
  sensitivity: BeneficiarySensitivity;
  yahooTicker?: string;
  googleTicker?: string;
  tickerStatus: 'validated' | 'corrected' | 'ambiguous' | 'unknown';
  evidence: string[];
  caveat?: string;
}

export interface TrendNextCheckpoint {
  checkpointKey: string;
  label: string;
  metric?: string;
  expectedDirection?: string;
  nextCheckWindow?: '7d' | '30d' | 'quarterly' | 'unknown';
  relatedSignalKeys: string[];
}

export interface TrendStructuredMemory {
  version: 'trend_memory_v2';
  topicKey: string;
  topicLabel: string;
  timeWindow: {
    requestedDays?: number;
    resolvedStartDate?: string;
    resolvedEndDate?: string;
  };
  freshSignals: TrendMemorySignal[];
  mediumTermSignals: TrendMemorySignal[];
  historicalReferences: TrendMemorySignal[];
  longTermTheses: TrendMemorySignal[];
  beneficiaries: TrendBeneficiary[];
  tickerValidation: TrendTickerValidationResult[];
  sourceQuality: TrendSourceQualityResult[];
  scores: TrendScoreItem[];
  nextCheckpoints: TrendNextCheckpoint[];
  warnings: string[];
}

export interface TrendMemoryCompareResult {
  newSignals: string[];
  strengthenedSignals: string[];
  weakenedSignals: string[];
  repeatedSignals: string[];
  thesisStatus: Array<{
    thesisKey: string;
    status: 'maintained' | 'strengthened' | 'weakened' | 'retire_candidate';
    reason: string;
  }>;
  warnings: string[];
}

export interface TrendOpsSummaryResponse {
  ok: boolean;
  range: {
    days: number;
    from: string;
    to: string;
  };
  totals: {
    events: number;
    info: number;
    warning: number;
    error: number;
    occurrenceTotal: number;
  };
  topCodes: Array<{
    code: string;
    severity: string;
    eventCount: number;
    occurrenceTotal: number;
    lastSeenAt?: string;
  }>;
  topFingerprints: Array<{
    fingerprint: string;
    code: string;
    severity: string;
    occurrenceCount: number;
    lastSeenAt?: string;
    message?: string;
  }>;
  tickerIssues: Array<{
    code: string;
    companyName?: string;
    inputTicker?: string;
    normalizedYahooTicker?: string;
    normalizedGoogleTicker?: string;
    status?: string;
    occurrenceCount: number;
    lastSeenAt?: string;
  }>;
  sourceQualityIssues: Array<{
    topicKey?: string;
    code: string;
    occurrenceCount: number;
    lastSeenAt?: string;
    message?: string;
  }>;
  memoryIssues: Array<{
    code: string;
    stage?: string;
    topicKey?: string;
    occurrenceCount: number;
    lastSeenAt?: string;
    message?: string;
  }>;
  degradedEvents: Array<{
    code: string;
    stage?: string;
    fallbackFrom?: string;
    fallbackTo?: string;
    reason?: string;
    occurrenceCount: number;
    lastSeenAt?: string;
  }>;
  recentEvents: Array<{
    severity: string;
    code: string;
    status?: string;
    occurrenceCount: number;
    firstSeenAt?: string;
    lastSeenAt?: string;
    message?: string;
    topicKey?: string;
    stage?: string;
  }>;
  warnings: string[];
}

export type TrendAnalysisMeta = {
  /** 최종 섹션 포맷 생성기 */
  provider: 'gemini';
  model: string;
  sourceCount: number;
  noDataReason?: string;
  appendToSheetsAttempted: boolean;
  appendToSheetsSucceeded?: boolean;

  researchLayer: TrendResearchLayer;
  openAiModel?: string;
  /** 리서치·합성 전체 흐름 */
  providerUsed: 'gemini_only' | 'openai_tools_then_gemini' | 'gemini_fallback_after_openai';
  webSearchUsed: boolean;
  dataAnalysisUsed: boolean;
  fallbackUsed: boolean;

  /** SQL memory layer (Phase 4) — 테이블 미생성 시 false + warnings */
  memoryEnabled: boolean;
  memoryReadSucceeded: boolean;
  memoryWriteSucceeded: boolean;
  memoryItemsRead: number;
  memoryItemsWritten: number;
  /** memory 비활성/실패 이유(개발자용, 짧게) */
  memoryStatusNote?: string;
};

/** 장기 메모리 delta 한 항목 */
export type TrendMemoryDeltaItem = {
  memoryKey: string;
  title: string;
  summary: string;
  reason: string;
};

/** 장기 메모리 delta (최소 분류) */
export type TrendMemoryDelta = {
  new: TrendMemoryDeltaItem[];
  reinforced: TrendMemoryDeltaItem[];
  weakened: TrendMemoryDeltaItem[];
  dormant: TrendMemoryDeltaItem[];
};

export const EMPTY_TREND_MEMORY_DELTA: TrendMemoryDelta = {
  new: [],
  reinforced: [],
  weakened: [],
  dormant: [],
};

export type TrendAnalysisGenerateResponseBody = {
  ok: true;
  title: string;
  generatedAt: string;
  mode: TrendReportMode;
  reportMarkdown: string;
  summary: string;
  sections: TrendSectionBlock[];
  beneficiaries: TrendBeneficiariesBlock;
  hypotheses: string;
  risks: string;
  nextTrackers: string;
  /** 리포트 본문 "출처" 섹션 텍스트 */
  sources: string;
  confidence: TrendConfidenceLevel;
  warnings: string[];
  meta: TrendAnalysisMeta;
  /** 구조화 출처 (웹 인용 등) */
  citations: TrendCitation[];
  toolUsage: TrendToolUsage;
  freshnessMeta: TrendFreshnessMetaOut;
  /** SQL memory vs 현재 리포트 비교 (테이블 없으면 빈 배열) */
  memoryDelta: TrendMemoryDelta;
  qualityMeta?: {
    timeWindow: TrendTimeCheckResult;
    sourceQuality: {
      counts: Record<TrendSourceGrade, number>;
      warnings: string[];
    };
    tickerValidation: {
      counts: Record<string, number>;
      items: TrendTickerValidationResult[];
      warnings: string[];
    };
    memory: {
      enabled: boolean;
      saved: boolean;
      reportRunSaved?: boolean;
      signalUpsert?: {
        ok: boolean;
        insertedCount: number;
        updatedCount: number;
        skippedCount: number;
        failedCount?: number;
        warnings: string[];
      };
      skippedReason?: string;
      compare?: TrendMemoryCompareResult;
    };
    opsLogging?: {
      attempted: boolean;
      savedCount?: number;
      failedCount?: number;
      warnings: string[];
    };
    warnings: string[];
    finalizer?: {
      provider: 'gemini' | 'openai' | 'fallback';
      ok: boolean;
      degraded: boolean;
      retryCount: number;
      fallbackUsed: boolean;
      userMessage?: string;
    };
    sheets?: {
      requestLogAppendOk?: boolean;
      requestLogAppendSkipped?: boolean;
      requestLogAppendWarning?: string;
    };
  };
  structuredMemory?: TrendStructuredMemory;
};

