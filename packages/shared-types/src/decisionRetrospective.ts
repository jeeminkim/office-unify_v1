/**
 * EVO-008: 판단 복기(판단 품질 개선). 수익률 자랑·자동매매·자동 주문과 무관.
 */

export type DecisionRetroSourceType =
  | 'today_candidate'
  | 'research_followup'
  | 'pb_weekly_review'
  | 'pb_message'
  | 'manual';

export type DecisionRetroStatus = 'draft' | 'reviewed' | 'learned' | 'archived';

export type DecisionRetroOutcome = 'helpful' | 'partially_helpful' | 'not_helpful' | 'unknown';

export type DecisionRetroQualitySignal =
  | 'risk_warning_useful'
  | 'suitability_warning_useful'
  | 'concentration_warning_useful'
  | 'data_quality_warning_useful'
  | 'followup_checked'
  | 'followup_missed'
  | 'pb_question_useful'
  | 'pb_question_too_generic'
  | 'thesis_invalidated'
  | 'unknown';

export type DecisionRetrospective = {
  id: string;
  sourceType: DecisionRetroSourceType;
  sourceId?: string;
  symbol?: string;
  title: string;
  summary: string;
  status: DecisionRetroStatus;
  outcome: DecisionRetroOutcome;
  qualitySignals: DecisionRetroQualitySignal[];
  whatWorked?: string;
  whatDidNotWork?: string;
  nextRule?: string;
  createdAt: string;
  updatedAt: string;
};

/** GET /api/decision-retrospectives qualityMeta (민감 원문 없음). */
export type DecisionRetrospectivesQualityMeta = {
  totalCount: number;
  statusCounts: Partial<Record<DecisionRetroStatus, number>>;
  outcomeCounts: Partial<Record<DecisionRetroOutcome, number>>;
  qualitySignalCounts: Partial<Record<DecisionRetroQualitySignal, number>>;
  staleDraftCount: number;
  learnedCount: number;
};
