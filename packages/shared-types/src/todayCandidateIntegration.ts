/** Today Candidates 통합 보강 — 진단·노출·추천 후보(additive). */

export type UsCandidateDiagnosticsStatus = 'ok' | 'degraded' | 'empty' | 'disabled' | 'unknown';

export type UsCandidateDiagnostics = {
  status: UsCandidateDiagnosticsStatus;
  userUsWatchlistCount: number;
  userUsHoldingCount: number;
  seedSymbolCount: number;
  quoteOkCount: number;
  quoteMissingCount: number;
  quoteStaleCount: number;
  usMarketSummaryStatus: 'ok' | 'degraded' | 'empty' | 'failed' | 'unknown';
  poolCandidateCount: number;
  poolUsDirectCount: number;
  poolUsKrMappedCount: number;
  selectedUsCandidateCount: number;
  selectedUsKrMappedCount: number;
  selectedUsDirectCount: number;
  suppressedUsCandidateCount: number;
  rejectedUsCandidateCount: number;
  topRejectReasons: string[];
  topSuppressReasons: string[];
  slotPolicy: {
    usSlotEnabled: boolean;
    minUsCandidateTarget: number;
    maxUsCandidateTarget: number;
  };
  actionHint?: string;
  /** additive: 사용자가 수행할 수 있는 점검 단계 */
  remediationSteps?: Array<{
    key: string;
    label: string;
    description: string;
    href?: string;
    actionType?: 'navigate' | 'refresh_quotes' | 'save_action_item' | 'disabled_todo';
  }>;
};

export type TodayCandidateExposureDiagnostics = {
  windowDays: number;
  selectedCount: number;
  watchlistSelectedCount: number;
  watchlistDominanceRatio: number;
  usSelectedCount: number;
  sectorRadarSelectedCount: number;
  repeatedSymbols: Array<{ symbol: string; name: string; count: number; lastSeenAt: string }>;
  warningCodes: string[];
  actionHint?: string;
  tableMissing?: boolean;
  /** additive: 사용자 피드백 집계(노출 이력과 분리) */
  feedback?: import('./todayCandidateFeedback').TodayCandidateExposureFeedbackDiagnostics;
};

export type SectorRadarSnapshotMeta = {
  saved: boolean;
  runId?: string;
  itemCount?: number;
  errorCode?: string;
  stale?: boolean;
  lastGeneratedAt?: string;
};

export type ResearchReportFreshness =
  | 'fresh'
  | 'reused_today'
  | 'reused_recent'
  | 'stale_diff_available'
  | 'regenerated_with_diff'
  | 'unknown';

export type ResearchReportHistoryMeta = {
  latestReportId?: string;
  latestGeneratedAt?: string;
  latestReportDate?: string;
  daysSinceLatest?: number;
  reusedExistingReport?: boolean;
  reportFreshness?: ResearchReportFreshness;
  forceRefreshAvailable?: boolean;
  actionHint?: string;
  tableMissing?: boolean;
};

export type ResearchReportDiffPayload = {
  previousReportId?: string;
  currentReportId?: string;
  diffDays?: number;
  diffSummary?: string;
  changedPoints?: string[];
  newRisks?: string[];
  removedRisks?: string[];
  changedCatalysts?: string[];
  dataQualityChanges?: string[];
};

export type WatchlistRecommendationCandidateSourceRef = {
  sourceType:
    | 'sector_radar_snapshot'
    | 'today_candidate_impression'
    | 'research_report'
    | 'holding'
    | 'watchlist_pattern'
    | 'trade_journal'
    | 'manual';
  sourceId?: string;
  label?: string;
};

export type WatchlistRecommendationCandidate = {
  recommendationId?: string;
  symbol: string;
  name: string;
  market: string;
  reasonCodes: string[];
  displayReasons: string[];
  sourceRefs: WatchlistRecommendationCandidateSourceRef[];
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  dataStatus: 'ok' | 'degraded' | 'missing' | 'unknown';
  alreadyInWatchlist: boolean;
  approvalStatus: 'pending' | 'approved' | 'rejected' | 'ignored';
  doNotDo: string[];
  nextChecks: string[];
};

export type RecommendationCandidatesQualityMeta = {
  status: 'ok' | 'empty' | 'degraded';
  generatedCount: number;
  pendingApprovalCount: number;
  sourceMix: Record<string, number>;
  actionHint?: string;
  tableMissing?: boolean;
};
