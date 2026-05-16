/** Today Candidates — 후보 선정·제외 감사 로그(additive, 매수 추천 아님). */

export type CandidateDecisionStatus =
  | 'selected'
  | 'suppressed'
  | 'rejected'
  | 'downgraded'
  | 'risk_review'
  | 'unknown';

export type CandidateDecisionBucket =
  | 'watchlist'
  | 'holding'
  | 'sector_radar'
  | 'us_signal'
  | 'research_followup'
  | 'trend_signal'
  | 'corporate_action_risk'
  | 'manual'
  | 'unknown';

/** 내부 코드 + 사용자 표시용 한국어 라벨 분리 */
export type CandidateTraceReason = {
  code: string;
  labelKo: string;
};

export type CandidateDecisionSourceRef = {
  sourceType:
    | 'watchlist'
    | 'holding'
    | 'sector_radar'
    | 'us_market'
    | 'research'
    | 'trend'
    | 'manual_registry'
    | 'unknown';
  sourceId?: string;
  label?: string;
  confidence?: 'high' | 'medium' | 'low' | 'unknown';
};

export type CandidateDecisionExposureTrace = {
  impressions7d?: number;
  detailOpens7d?: number;
  dismissed7d?: number;
  repeatExposurePenalty?: number;
};

export type CandidateDecisionTrace = {
  candidateId?: string;
  symbol?: string;
  name?: string;
  market?: string;

  decisionStatus: CandidateDecisionStatus;
  candidateBucket: CandidateDecisionBucket;

  selectedReasons: CandidateTraceReason[];
  suppressedReasons: CandidateTraceReason[];
  rejectedReasons: CandidateTraceReason[];
  downgradeReasons: CandidateTraceReason[];
  missingEvidence: CandidateTraceReason[];
  dataQualityFlags: CandidateTraceReason[];
  riskFlags: CandidateTraceReason[];

  scoreBeforeAdjustments?: number;
  scoreAfterAdjustments?: number;
  scoreCapApplied?: number;
  scoreBreakdownRef?: string;

  sourceRefs?: CandidateDecisionSourceRef[];

  exposure?: CandidateDecisionExposureTrace;

  nextChecks: string[];
  doNotDo: string[];
};

export type CandidateDecisionReasonCount = {
  code: string;
  labelKo: string;
  count: number;
};

/** qualityMeta.todayCandidates.decisionTraceSummary */
export type TodayCandidatesDecisionTraceSummary = {
  selectedCount: number;
  suppressedCount: number;
  rejectedCount: number;
  downgradedCount: number;
  riskReviewCount: number;
  topSuppressedReasons: CandidateDecisionReasonCount[];
  topRejectedReasons: CandidateDecisionReasonCount[];
  topMissingEvidence: CandidateDecisionReasonCount[];
  /** 덱 후보 중 decisionTrace가 채워진 비율 */
  traceCoverageRatio: number;
};

export type CandidateJudgmentQualityLevel = 'high' | 'medium' | 'low' | 'unknown';

/** 관찰 점수와 별개 — 근거 충분성·데이터 성숙도(additive) */
export type CandidateJudgmentQuality = {
  score: number;
  level: CandidateJudgmentQualityLevel;
  reasons: string[];
  penalties: string[];
};

export type TodayCandidatesJudgmentQualitySummary = {
  avgScore?: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  unknownCount: number;
};
