export type InvestmentPrincipleType = 'buy' | 'sell' | 'common' | 'risk';
export type InvestmentPrincipleCheckMethod =
  | 'blocking_boolean'
  | 'boolean'
  | 'threshold_numeric'
  | 'portfolio_exposure'
  | 'score'
  | 'manual';
export type InvestmentPrincipleAppliesTo = 'all' | 'long_term' | 'swing' | 'short_term';
export type TradeJournalSide = 'buy' | 'sell';
export type TradeJournalStrategyHorizon = 'long_term' | 'swing' | 'short_term';
export type TradeJournalEntryType =
  | 'value_entry'
  | 'trend_follow'
  | 'rebalancing_buy'
  | 'event_driven_buy'
  | 'long_term_accumulate';
export type TradeJournalExitType =
  | 'target_reached'
  | 'thesis_broken'
  | 'risk_reduction'
  | 'rebalancing_sell'
  | 'stop_loss'
  | 'event_avoidance';
export type TradeJournalConvictionLevel = 'low' | 'medium' | 'high';
export type TradeJournalCheckStatus = 'met' | 'not_met' | 'unclear' | 'manual_required';
export type TradeJournalReviewVerdict = 'proceed_with_caution' | 'review_more' | 'avoid' | 'aligned';
export type TradeJournalAgreementLevel = 'low' | 'medium' | 'high';
export type TradeJournalReflectionType = 'week_1' | 'month_1' | 'after_exit' | 'manual';
export type TradeJournalFollowupStatus = 'pending' | 'done' | 'cancelled';

export type InvestmentPrincipleSet = {
  id: string;
  userKey: string;
  name: string;
  description?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InvestmentPrinciple = {
  id: string;
  principleSetId: string;
  principleType: InvestmentPrincipleType;
  title: string;
  ruleText: string;
  checkMethod: InvestmentPrincipleCheckMethod;
  ruleKey?: string;
  targetMetric?: string;
  operator?: string;
  thresholdValue?: number;
  thresholdUnit?: string;
  requiresUserInput: boolean;
  appliesWhenJson: Record<string, unknown>;
  evaluationHint?: string;
  weight: number;
  isBlocking: boolean;
  appliesTo: InvestmentPrincipleAppliesTo;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type TradeJournalEntry = {
  id: string;
  userKey: string;
  symbol: string;
  market?: string;
  side: TradeJournalSide;
  strategyHorizon?: TradeJournalStrategyHorizon;
  entryType?: TradeJournalEntryType;
  exitType?: TradeJournalExitType;
  convictionLevel?: TradeJournalConvictionLevel;
  tradeDate: string;
  quantity?: number;
  price?: number;
  amount?: number;
  thesisSummary?: string;
  tradeReason?: string;
  expectedScenario?: string;
  invalidationCondition?: string;
  emotionState?: string;
  note?: string;
  reviewDueAt?: string;
  reflectionDueAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type TradeJournalCheckResult = {
  id: string;
  tradeJournalEntryId: string;
  principleId: string;
  status: TradeJournalCheckStatus;
  score?: number;
  explanation?: string;
  evidenceJson: Record<string, unknown>;
  createdAt: string;
};

export type TradeJournalEvaluation = {
  id: string;
  tradeJournalEntryId: string;
  checklistScore?: number;
  checklistMetCount: number;
  checklistTotalCount: number;
  blockingViolationCount: number;
  summary?: string;
  createdAt: string;
};

export type TradeJournalReview = {
  id: string;
  tradeJournalEntryId: string;
  personaKey: string;
  verdict?: TradeJournalReviewVerdict;
  reviewSummary?: string;
  contentJson: Record<string, unknown>;
  entrySnapshotJson: Record<string, unknown>;
  evaluationSnapshotJson: Record<string, unknown>;
  createdAt: string;
};

export type TradeJournalReflection = {
  id: string;
  tradeJournalEntryId: string;
  reflectionType: TradeJournalReflectionType;
  thesisOutcome?: string;
  principleAlignment?: string;
  whatWentWell?: string;
  whatWentWrong?: string;
  nextRuleAdjustment?: string;
  createdAt: string;
};

export type TradeJournalFollowup = {
  id: string;
  tradeJournalEntryId: string;
  followupType: string;
  dueAt?: string;
  status: TradeJournalFollowupStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type TradeJournalEntryDraft = Omit<
  TradeJournalEntry,
  'id' | 'userKey' | 'createdAt' | 'updatedAt'
>;

/** Today Candidate 카드에서 매매일지 초안 연결용(additive, DB 컬럼 없이도 요청·표시 가능) */
export type TradeJournalTodayCandidateSeedContext = {
  source: 'today_candidate';
  symbol?: string;
  stockCode?: string;
  market?: string;
  candidateDate?: string;
  decisionTraceSummary?: string;
  riskFlags?: string[];
  nextChecks?: string[];
  doNotDo?: string[];
};

export type TradeJournalCreateRequest = {
  entry: TradeJournalEntryDraft;
  selectedPrincipleSetId?: string;
  requireNoBlockingViolation?: boolean;
  seedContext?: TradeJournalTodayCandidateSeedContext;
};

export type TradeJournalCheckDetail = {
  principleId: string;
  title: string;
  principleType: InvestmentPrincipleType;
  isBlocking: boolean;
  status: TradeJournalCheckStatus;
  score?: number;
  explanation: string;
  ruleKey?: string;
  targetMetric?: string;
  comparisonOperator?: string;
  matchedMetric?: string;
  observedValue?: string | number | boolean | null;
  thresholdValue?: number | string | null;
  decisionBasis?: string;
  appliedRuleKey?: string;
  autoEvaluated?: boolean;
  evidenceJson: Record<string, unknown>;
};

export type TradeJournalCheckResponse = {
  checklistScore: number;
  checklistMetCount: number;
  checklistTotalCount: number;
  blockingViolationCount: number;
  summary: string;
  details: TradeJournalCheckDetail[];
};

export type TradeJournalReviewResponse = {
  reviewSummary: string;
  agreementLevel: TradeJournalAgreementLevel;
  missingChecks: string[];
  risks: string[];
  nextActions: string[];
  verdict: TradeJournalReviewVerdict;
  warnings: string[];
};

export type TradeJournalReviewRequest = {
  selectedPersona: string;
  entry?: TradeJournalEntryDraft;
  tradeJournalEntryId?: string;
  evaluation?: TradeJournalCheckResponse;
  selectedPrincipleSetId?: string;
};

export type TradeJournalAnalyticsResponse = {
  totalEntries: number;
  avgChecklistScore: number;
  blockingViolationRate: number;
  buyAvgChecklistScore: number;
  sellAvgChecklistScore: number;
  buySellChecklistGap: number;
  topViolatedPrinciples: Array<{ principleId: string; title: string; count: number }>;
  topReflectionFailurePatterns: Array<{ label: string; count: number }>;
  sellMetrics?: {
    exitTypeAvgScore: Array<{ exitType: string; avgScore: number; count: number }>;
    thesisBrokenEvidenceRate: number;
    stopLossInvalidationProvidedRate: number;
    sellBlockingViolationRate: number;
    topSellReflectionFailurePatterns: Array<{ label: string; count: number }>;
  };
  detail?: {
    verdictDistribution: Record<string, number>;
  };
};

