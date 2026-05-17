/** Today Candidate 사용자 피드백(additive, confirm 후 write만). */

export type TodayCandidateFeedbackAction = 'hide_7d' | 'mark_reviewed' | 'keep_observing';

export type TodayCandidateFeedbackSourceRoute =
  | 'today-brief'
  | 'dashboard'
  | 'risk-review-panel';

export type TodayCandidateFeedbackRequest = {
  candidateId?: string;
  symbol?: string;
  name?: string;
  market?: string;
  action: TodayCandidateFeedbackAction;
  reason?: string;
  requestId?: string;
  sourceRoute?: TodayCandidateFeedbackSourceRoute;
  idempotencyKey?: string;
  sourceContext?: {
    candidateAction?: string;
    riskFlags?: string[];
    decisionStatus?: string;
    score?: number;
    judgmentQualityLevel?: string;
  };
};

export type TodayCandidateFeedbackStatus =
  | 'saved'
  | 'already_applied'
  | 'skipped'
  | 'table_missing'
  | 'invalid_request'
  | 'error';

export type TodayCandidateFeedbackResponse = {
  ok: boolean;
  action: TodayCandidateFeedbackAction;
  status: TodayCandidateFeedbackStatus;
  feedbackId?: string;
  effectiveUntil?: string;
  idempotencyKey?: string;
  actionHint?: string;
  qualityMeta?: {
    writeAction: true;
    userConfirmedRequired: true;
    idempotent: boolean;
  };
};

export type TodayCandidateUserFeedbackState = {
  action: TodayCandidateFeedbackAction;
  createdAt: string;
  effectiveUntil?: string;
  active: boolean;
  feedbackId?: string;
};

export type TodayCandidateFeedbackSummary = {
  status?: 'ok' | 'table_missing' | 'degraded';
  hide7dActiveCount: number;
  reviewedCount: number;
  keepObservingCount: number;
  suppressedByFeedbackCount: number;
  actionHint?: string;
};

export type TodayCandidateExposureFeedbackDiagnostics = {
  hide7dActiveCount: number;
  reviewedRecentCount: number;
  keepObservingCount: number;
};
