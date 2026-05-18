/**
 * EVO-012: 30일 판단 품질 복기 리포트 (수익률 평가·자동매매·매수/매도 지시 아님).
 */

export type JudgmentReviewWindow = {
  startDate: string;
  endDate: string;
  days: number;
};

export type MonthlyJudgmentReviewPrimaryPattern =
  | 'sector_concentration'
  | 'momentum_chasing'
  | 'loss_cut_rotation'
  | 'risk_review_ignored'
  | 'over_researching'
  | 'under_reviewing'
  | 'data_quality_issue'
  | 'balanced'
  | 'unknown';

export type MonthlyJudgmentReviewStatus = 'ready' | 'partial' | 'insufficient_data' | 'error';

export type JudgmentReviewDataCoverage = 'ok' | 'partial' | 'missing';

export type MonthlyJudgmentReview = {
  reviewId?: string;
  window: JudgmentReviewWindow;
  status: MonthlyJudgmentReviewStatus;

  headline: {
    summary: string;
    primaryPattern: MonthlyJudgmentReviewPrimaryPattern;
    confidence: 'high' | 'medium' | 'low' | 'unknown';
  };

  metrics: {
    todayCandidateCount: number;
    riskReviewCount: number;
    actionItemCreatedCount: number;
    actionItemDoneCount: number;
    actionItemDismissedCount: number;
    actionItemCompletionRatio: number;
    tradeJournalCount: number;
    retrospectiveCount: number;
    researchReportCount: number;
    reportDiffCount: number;
    committeeRoadmapCount: number;
    watchlistRecommendationApprovedCount: number;
    watchlistRecommendationRejectedCount: number;
    /** additive: EVO-015 daily review notes in window */
    dailyReviewNoteCount?: number;
    savedDailyNoteCount?: number;
    dismissedDailyNoteCount?: number;
  };

  repeatedPatterns: Array<{
    patternKey: string;
    label: string;
    evidenceCount: number;
    examples: Array<{
      sourceType: string;
      symbol?: string;
      title?: string;
      date?: string;
    }>;
    interpretation: string;
    suggestedRule: string;
  }>;

  missedChecks: Array<{
    checkKey: string;
    label: string;
    sourceType: string;
    evidence: string;
    nextAction: string;
  }>;

  improvedBehaviors: Array<{
    label: string;
    evidence: string;
    whyItMatters: string;
  }>;

  actionQueueReview: {
    overdueCount: number;
    doneCount: number;
    dismissedCount: number;
    staleOpenItems: Array<{
      id: string;
      title: string;
      sourceType: string;
      ageDays: number;
      priority: 'high' | 'medium' | 'low';
    }>;
  };

  portfolioBehaviorSignals: {
    concentrationWarnings: string[];
    leverageWarnings: string[];
    repeatedSectorMentions: Array<{ sector: string; count: number }>;
    symbolsMentionedOften: Array<{ symbol: string; name?: string; count: number }>;
  };

  nextMonthRules: Array<{
    ruleTitle: string;
    reason: string;
    triggerCondition: string;
    actionType:
      | 'check_before_trade'
      | 'create_research_before_action'
      | 'limit_repeated_exposure'
      | 'review_risk_before_adding'
      | 'write_retrospective'
      | 'manual';
    notTradeInstruction: true;
  }>;

  actionItemsToCreate?: Array<{
    title: string;
    actionCategory: 'check_now' | 'monitor' | 'research_needed' | 'retrospective_needed' | 'risk_review';
    priority: 'high' | 'medium' | 'low';
    reason: string;
  }>;

  qualityMeta: {
    dataCoverage: {
      todayCandidates: JudgmentReviewDataCoverage;
      actionItems: JudgmentReviewDataCoverage;
      tradeJournal: JudgmentReviewDataCoverage;
      retrospectives: JudgmentReviewDataCoverage;
      researchReports: JudgmentReviewDataCoverage;
      committee: JudgmentReviewDataCoverage;
      /** additive: EVO-015 */
      dailyReviewNotes?: JudgmentReviewDataCoverage;
    };
    warnings: string[];
    readOnlyPreview: boolean;
    generatedAt: string;
  };
};

export type MonthlyJudgmentReviewPreviewResponse = {
  ok: true;
  review: MonthlyJudgmentReview;
  recommendedIdempotencyKey: string;
  windowKey: string;
  sqlReadiness?: {
    actionHints: string[];
  };
};

export type MonthlyJudgmentReviewSaveResponse = {
  ok: true;
  saved: boolean;
  alreadyApplied: boolean;
  retrospectiveId?: string;
  recommendedIdempotencyKey: string;
};

export type MonthlyJudgmentReviewActionItemsResponse = {
  ok: true;
  created: number;
  skipped: number;
  items: Array<{ id: string; title: string; deduped: boolean }>;
};
