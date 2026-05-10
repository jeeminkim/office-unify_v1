/**
 * Research Center — 단일 종목 심층 리포트 (투자위원회·조일현·원장과 분리)
 */

import type { ResearchCenterStage } from './researchCenterErrors';

export type { ResearchCenterStage };

export type ResearchDeskId =
  | 'goldman_buy'
  | 'blackrock_quality'
  | 'hindenburg_short'
  | 'citadel_tactical_short';

export type ResearchToneMode = 'standard' | 'strong' | 'forensic';

export type ResearchCenterGenerateRequestBody = {
  market: 'KR' | 'US';
  symbol: string;
  name: string;
  /** client-generated trace id (optional) */
  requestId?: string;
  sector?: string;
  /** 비어 있으면 서버에서 `all`과 동일 처리 가능 */
  selectedDesks: ResearchDeskId[] | 'all';
  toneMode?: ResearchToneMode;
  userHypothesis?: string;
  knownRisk?: string;
  holdingPeriod?: string;
  keyQuestion?: string;
  includeSheetContext?: boolean;
  /** 시트에 요청/로그 append (환경 설정 시) */
  saveToSheets?: boolean;
  /** 재생성 시 Chief Editor 비교용 */
  previousEditorVerdict?: string;
};

export type ResearchCenterFailedStage = ResearchCenterStage;

export type ResearchCenterQualityMeta = {
  requestId: string;
  status: 'ok' | 'degraded' | 'failed';
  generatedAt: string;
  failedStage?: ResearchCenterFailedStage;
  provider?: 'openai' | 'gemini' | 'mixed' | 'unknown';
  sheetsSave?: {
    requested: boolean;
    ok: boolean;
    warningCode?: string;
    failedTargets?: Array<'research_requests' | 'research_reports_log' | 'research_context_cache'>;
  };
  memoryCompare?: {
    requested: boolean;
    ok: boolean;
    degraded?: boolean;
    warningCode?: string;
  };
  contextCache?: {
    requested: boolean;
    ok: boolean;
    warningCode?: string;
  };
  warnings: string[];
  /** Parsed timeout ceilings (no secrets; invalid env → defaults + warnings only). */
  timeoutBudget?: {
    totalMs: number;
    providerPerCallMs: number;
    finalizerMs: number;
    sheetsMs: number;
    contextCacheMs: number;
    /** Non-empty when env values failed to parse and defaults were used. */
    invalidEnvKeys?: string[];
  };
  /** Desk phase + parallel Gemini calls (excluding chief editor finalizer). */
  deskPhaseMs?: number;
  /** Chief editor / finalizer Gemini call only. */
  finalizerMs?: number;
  /** Number of full-engine retries after transient provider failures (0–1 typical). */
  providerRetryCount?: number;
  timings?: {
    totalMs: number;
    inputValidationMs?: number;
    providerMs?: number;
    /** research_requests + research_reports_log append duration (excludes context_cache row). */
    sheetsMs?: number;
    /** research_context_cache row append duration. */
    contextCacheMs?: number;
    /** Reserved when a compare stage exists (e.g. Trend-adjacent); Research Center body path may omit. */
    memoryCompareMs?: number;
    timeoutBudgetMs: number;
    nearTimeout: boolean;
  };
  opsLogging?: {
    attempted: number;
    written: number;
    skippedCooldown: number;
    skippedBudgetExceeded: number;
    skippedReadOnly: number;
  };
};

export type ResearchCenterOpsSummaryRecentEvent = {
  code: string;
  severity: 'info' | 'warning' | 'error';
  stage?: string;
  requestId?: string;
  message: string;
  lastSeenAt: string;
  occurrenceCount: number;
};

export type ResearchCenterOpsFailureCategories = {
  providerTimeout: number;
  providerCallFailed: number;
  responseParseFailed: number;
  sheetsRelated: number;
  contextCacheRelated: number;
  memoryCompareRelated: number;
  inputInvalid: number;
  other: number;
};

export type ResearchCenterOpsSummaryResponse = {
  ok: boolean;
  range: '24h' | '7d';
  generatedAt: string;
  summary: {
    totalEvents: number;
    /** Sum of `occurrence_count` across returned rows (weighted volume). */
    totalOccurrences: number;
    /** Occurrence-weighted volume for `research_report_degraded`. */
    degradedCount: number;
    /** Occurrence-weighted volume for rows with error severity. */
    errorCount: number;
    /** 0–1, `degradedCount / totalOccurrences`. */
    degradedRatio: number;
    /** 0–1, `errorCount / totalOccurrences`. */
    errorRatio: number;
    topEventCodes: Array<{ code: string; count: number }>;
    severityCounts: Record<'info' | 'warning' | 'error', number>;
    failedStageCounts: Record<string, number>;
    failureCategories: ResearchCenterOpsFailureCategories;
    /** Recent distinct requestIds seen on warning/error paths (newest first). */
    recentRequestIds: string[];
    requestIdHit?: {
      requestId: string;
      count: number;
    };
  };
  recentEvents: ResearchCenterOpsSummaryRecentEvent[];
  recentFailureEvents: ResearchCenterOpsSummaryRecentEvent[];
  qualityMeta: {
    researchCenterOpsSummary: {
      readOnly: true;
      source: 'web_ops_events';
      warnings: string[];
    };
  };
};

export type ResearchCenterGenerateResponseBody = {
  reports: Partial<Record<ResearchDeskId, string>>;
  editor: string;
  /** 운영 맥락 요약(참고) */
  contextNote: string;
  /** 원장 매칭 — UI·시트 캐시용 */
  isHolding: boolean;
  isWatchlist: boolean;
  holdingWeightApprox?: string;
  /** 시트 research_context_cache append 시 사용(원장·메모 스냅샷) */
  sheetContextSnapshot?: {
    avgPrice: string;
    targetPrice: string;
    holdingWeightPct: string;
    watchlistPriority: string;
    investmentMemo: string;
    interestReason: string;
    observationPoints: string;
    committeeSummaryHint: string;
  };
  sheetsAppended: boolean;
  warnings: string[];
  reportRef: string;
  meta?: {
    providerUsed: 'gemini_only';
    fallbackUsed: boolean;
    /** full = chief editor OK; fallback_editor_synthesis = desk 요약 병합(분석 보조용, 투자 조언 아님) */
    resultMode?: 'full' | 'fallback_editor_synthesis';
    /** Transient provider failures before success (0–1 typical). */
    providerRetryCount?: number;
    includeSheetContext: boolean;
    sheetsAppendAttempted: boolean;
    sheetsAppendSucceeded: boolean;
    noData: boolean;
  };
  ok?: boolean;
  requestId?: string;
  errorCode?: string;
  message?: string;
  actionHint?: string;
  qualityMeta?: {
    researchCenter?: ResearchCenterQualityMeta;
  };
};

export type ResearchCenterGenerateErrorResponseBody = {
  ok: false;
  requestId: string;
  errorCode: string;
  message: string;
  actionHint?: string;
  qualityMeta?: {
    researchCenter?: ResearchCenterQualityMeta;
  };
};

/** Single-request ops trace (read-only SELECT on web_ops_events). */
export type ResearchCenterOpsTraceTimelineEntry = {
  at: string;
  stage: string;
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  durationMs?: number;
  actionHint?: string;
};

export type ResearchCenterOpsTraceResponse = {
  requestId: string;
  found: boolean;
  range: '24h' | '7d';
  summary?: {
    severityMax: 'error' | 'warning' | 'info';
    statusCounts: Record<string, number>;
    firstSeenAt?: string;
    lastSeenAt?: string;
    durationObservedMs?: number;
    primaryCategory:
      | 'provider_timeout'
      | 'provider_failed'
      | 'response_parse'
      | 'sheets_failed'
      | 'context_cache_failed'
      | 'degraded'
      | 'success'
      | 'unknown';
  };
  timeline: ResearchCenterOpsTraceTimelineEntry[];
  recommendedAction?: string;
  qualityMeta: {
    researchCenterOpsTrace: {
      readOnly: true;
      source: 'web_ops_events';
      warnings: string[];
    };
  };
};
