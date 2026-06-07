export type OpsRunbookStepKey =
  | "check_google_finance_setup"
  | "refresh_portfolio_quotes"
  | "wait_formula_readback"
  | "check_quote_status"
  | "resolve_watchlist_tickers"
  | "run_discovery_universe"
  | "check_theme_mapping"
  | "rerun_today_brief"
  | "open_quote_provider_status";

export type OpsRunbookStep = {
  key: OpsRunbookStepKey;
  labelKo: string;
  reasonKo: string;
  actionType: "read_only" | "explicit_post" | "confirm_write" | "navigate" | "wait";
  endpoint?: string;
  method?: "GET" | "POST";
  requiresConfirm: boolean;
  canAutoRunAfterUserClick: boolean;
  result?: "pending" | "passed" | "warning" | "failed" | "skipped";
};

export type OpsRunbookPlan = {
  status: "ready" | "needs_action" | "blocked" | "degraded";
  runbookId: string;
  title: string;
  summary: string;
  steps: OpsRunbookStep[];
  safeToRunSteps: OpsRunbookStep[];
  confirmRequiredSteps: OpsRunbookStep[];
  blockedSteps: OpsRunbookStep[];
  expectedOutcome: string;
  writeAction: boolean;
};

export type OpsRunbookScope = "us_data_readiness" | "portfolio_quotes" | "today_candidates";

export type OpsRunbookExecuteRequest = {
  confirm: true;
  scope: OpsRunbookScope;
  allowConfirmedSheetRepair?: boolean;
};

export type OpsRunbookExecutionResponse = {
  ok: boolean;
  runbookId: string;
  executedAt: string;
  scope: OpsRunbookScope;
  plan: OpsRunbookPlan;
  messages: string[];
  writeAction: boolean;
};

export type QuoteRecoveryRunbookStep = {
  key:
    | "check_quote_status"
    | "refresh_missing_quotes"
    | "wait_formula_readback"
    | "recheck_quote_status"
    | "resolve_missing_tickers"
    | "check_us_feed"
    | "check_us_theme_mapping"
    | "run_discovery_universe"
    | "rerun_today_brief"
    | "open_google_finance_settings";
  labelKo: string;
  descriptionKo: string;
  actionType: "read_only" | "explicit_post" | "wait" | "navigate" | "confirm_write";
  status: "pending" | "running" | "passed" | "warning" | "failed" | "skipped";
  canRunAfterUserClick: boolean;
  requiresConfirm: boolean;
  resultSummaryKo?: string;
  requestId?: string;
};

export type QuoteRecoveryRunbookResponse = {
  ok: boolean;
  runbookId: string;
  status: "ready" | "running" | "completed" | "partial" | "blocked";
  title: string;
  summaryKo: string;
  steps: QuoteRecoveryRunbookStep[];
  nextPrimaryAction:
    | "run_recovery"
    | "wait_and_recheck"
    | "open_quote_status"
    | "open_ticker_resolve"
    | "open_theme_mapping"
    | "rerun_today_brief"
    | "none";
  writeAction: boolean;
  autoTrading: false;
  autoOrder: false;
};

export type QuoteRecoveryRunbookScope = "dashboard" | "portfolio" | "today_candidates" | "us_data";

export type QuoteRecoveryRunbookExecuteRequest = {
  confirm: true;
  scope: QuoteRecoveryRunbookScope;
  allowSheetsRepair?: boolean;
};

export type CandidateDisplaySlotKind =
  | "candidate"
  | "low_confidence_candidate"
  | "risk_review"
  | "data_check"
  | "us_diagnostic"
  | "insufficient_candidate";

export type CandidateDisplaySlot = {
  /** EVO-055 server-owned display contract fields. */
  slotId: string;
  slotIndex: number;
  targetMarket: "KR" | "US" | "ANY";
  kind: CandidateDisplaySlotKind;
  title: string;
  subtitle?: string;
  reasonCode: import("./todayCandidateIntegration").QuoteRootCauseCode;
  reasonLabelKo: string;
  primaryAction:
    | "quote_recovery"
    | "quote_status_check"
    | "google_finance_setup"
    | "ticker_resolver"
    | "us_mapping_diagnosis"
    | "theme_mapping_check"
    | "discovery_universe_check"
    | "none";
  primaryActionLabelKo: string;
  isTradeCandidate: false;
  actionHintKo: string;
  /** Legacy EVO-053 fields kept optional for older callers. */
  slotKind?:
    | "qualified_candidate"
    | "low_confidence_candidate"
    | "data_check_candidate"
    | "risk_review_candidate"
    | "us_diagnostic_slot"
    | "insufficient_candidate_slot";
  slotLabelKo?: string;
  reasonKo?: string;
};
