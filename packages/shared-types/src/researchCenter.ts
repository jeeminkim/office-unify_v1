/**
 * Research Center — 단일 종목 심층 리포트 (투자위원회·조일현·원장과 분리)
 */

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

export type ResearchCenterFailedStage =
  | 'input'
  | 'provider'
  | 'sheets'
  | 'memory_compare'
  | 'context_cache'
  | 'response_parse'
  | 'unknown';

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
  opsLogging?: {
    attempted: number;
    written: number;
    skippedCooldown: number;
    skippedBudgetExceeded: number;
    skippedReadOnly: number;
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
