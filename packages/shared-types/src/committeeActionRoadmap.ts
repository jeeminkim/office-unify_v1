/** 위원회 토론 후 사용자 액션 로드맵(additive). 매수/매도 지시·자동 실행 아님. */

export type CommitteeActionRoadmapStatus =
  | 'ready'
  | 'partial'
  | 'insufficient_data'
  | 'needs_user_review';

export type CommitteePrimaryConcern =
  | 'sector_concentration'
  | 'leverage_exposure'
  | 'momentum_chasing'
  | 'loss_cut_rotation'
  | 'data_insufficient'
  | 'portfolio_balance'
  | 'unknown';

export type CommitteeDecisionStance =
  | 'observe'
  | 'risk_review'
  | 'review_required'
  | 'avoid_new_action'
  | 'insufficient_data';

export type CommitteeActionItemPriority = 'high' | 'medium' | 'low';

export type CommitteeActionItem = {
  title: string;
  reason: string;
  linkedPersonaIds: string[];
  priority: CommitteeActionItemPriority;
  dueHint?: string;
  evidenceNeeded?: string[];
  notTradeInstruction: true;
};

export type CommitteeActionRoadmap = {
  status: CommitteeActionRoadmapStatus;
  decisionFrame: {
    question: string;
    userDecisionSummary?: string;
    primaryConcern: CommitteePrimaryConcern;
    stance: CommitteeDecisionStance;
    confidence: 'high' | 'medium' | 'low' | 'unknown';
  };
  actionBuckets: {
    doThisWeek: CommitteeActionItem[];
    doNotDo: CommitteeActionItem[];
    monitor: CommitteeActionItem[];
    researchNeeded: CommitteeActionItem[];
    retrospectiveNeeded: CommitteeActionItem[];
    /** additive: UI materialization buckets */
    checkNow?: CommitteeActionItem[];
    riskReview?: CommitteeActionItem[];
    portfolioReview?: CommitteeActionItem[];
    partialRecovery?: CommitteeActionItem[];
  };
  portfolioImplications: {
    concentrationWarnings: string[];
    leverageWarnings: string[];
    positionSizingWarnings: string[];
    missingPortfolioData: string[];
  };
  verificationPlan: {
    variables: Array<{
      label: string;
      whyItMatters: string;
      checkFrequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
      sourceHint?: string;
    }>;
    reviewDateHint?: string;
    validUntil?: string;
  };
  actionLinks?: Array<{
    actionKey:
      | 'create_followups'
      | 'save_decision_retrospective'
      | 'open_research_center'
      | 'open_trade_journal_seed'
      | 'open_portfolio_exposure'
      | 'copy_checklist';
    label: string;
    description: string;
    href?: string;
    method?: 'GET' | 'POST';
    writeAction: boolean;
    requiresConfirmation: boolean;
  }>;
  qualityMeta?: {
    missingSections: string[];
    truncatedPersonaIds: string[];
    sanitizedPromptLeaks: number;
    generatedFromRounds: number;
    actionabilityScore: number;
  };
};

export type CommitteeLineOutputQuality = {
  status: 'ok' | 'partial' | 'format_warning';
  truncated?: boolean;
  missingSections?: string[];
  sanitizedPromptLeaks?: number;
  actionHint?: string;
};

export type CommitteeDiscussionClosingResponseBody = {
  cio: import('./personaChat').CommitteeDiscussionLineDto;
  drucker: import('./personaChat').CommitteeDiscussionLineDto;
  /** additive */
  actionRoadmap?: CommitteeActionRoadmap;
  qualityMeta?: {
    actionabilityScore?: number;
    missingActionBuckets?: string[];
    truncatedInputLines?: string[];
    promptLeakSanitizedCount?: number;
    /** additive: read-only 개인화 요약 */
    personalizationContextSummary?: import('./userPersonalizationContext').PersonalizationContextSummary;
  };
};
