/**
 * EVO-004: PB 주간 점검 리포트(판단 보조). 매수 추천·자동 주문과 무관.
 */

export type PbWeeklyReviewItemType =
  | 'today_candidate'
  | 'followup'
  | 'concentration_risk'
  | 'suitability_warning';

export type PbWeeklyReviewItemSeverity = 'info' | 'watch' | 'caution';

export type PbWeeklyReviewItem = {
  id: string;
  type: PbWeeklyReviewItemType;
  title: string;
  summary: string;
  severity: PbWeeklyReviewItemSeverity;
  relatedSymbol?: string;
  relatedTheme?: string;
  actionQuestion: string;
};

export type PbWeeklyReviewProfileStatus = 'missing' | 'partial' | 'complete';

export type PbWeeklyReviewDataQuality = 'ok' | 'partial' | 'missing';

/** Additive: PB 응답 형식 검증 메타(1차는 경고만, 재요청 없음). */
export type PbWeeklyReviewResponseGuardMeta = {
  missingSections: string[];
  /** 응답에 금지 정책 문구가 빠졌을 때 등 */
  policyPhraseWarnings?: string[];
};

export type PbWeeklyReviewQualityMeta = {
  todayCandidateCount: number;
  staleFollowupCount: number;
  concentrationRiskCount: number;
  suitabilityWarningCount: number;
  dataQuality: PbWeeklyReviewDataQuality;
  /** Additive: POST PB 생성 후 응답 검증. */
  privateBanker?: {
    responseGuard?: PbWeeklyReviewResponseGuardMeta;
  };
};

export type PbWeeklyReview = {
  weekOf: string;
  profileStatus: PbWeeklyReviewProfileStatus;
  sections: {
    candidates: PbWeeklyReviewItem[];
    followups: PbWeeklyReviewItem[];
    risks: PbWeeklyReviewItem[];
    questions: PbWeeklyReviewItem[];
  };
  caveat: string;
  qualityMeta: PbWeeklyReviewQualityMeta;
};
