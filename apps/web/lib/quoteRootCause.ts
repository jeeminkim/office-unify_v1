import type { QuoteRootCauseCode } from '@office-unify/shared-types';

export type QuoteRootCausePrimaryAction =
  | 'quote_recovery'
  | 'quote_status_check'
  | 'google_finance_setup'
  | 'ticker_resolver'
  | 'us_mapping_diagnosis'
  | 'theme_mapping_check'
  | 'discovery_universe_check'
  | 'none';

export type QuoteRootCauseSeverity = 'info' | 'warning' | 'critical';

export type QuoteRootCause = {
  code: QuoteRootCauseCode;
  userTitleKo: string;
  userMessageKo: string;
  primaryAction: QuoteRootCausePrimaryAction;
  primaryActionLabelKo: string;
  secondaryActions: QuoteRootCausePrimaryAction[];
  isGoogleFinanceProblem: boolean;
  isQuoteUsabilityProblem: boolean;
  isMappingProblem: boolean;
  isCandidateProblem: boolean;
  severity: QuoteRootCauseSeverity;
};

const ROOT_CAUSES: Record<QuoteRootCauseCode, QuoteRootCause> = {
  provider_not_configured: {
    code: 'provider_not_configured',
    userTitleKo: 'Quote provider not configured',
    userMessageKo: 'Realtime or near-realtime quote provider is not configured. Google Sheets is only delayed read-back.',
    primaryAction: 'quote_status_check',
    primaryActionLabelKo: 'Quote provider status',
    secondaryActions: ['quote_recovery'],
    isGoogleFinanceProblem: false,
    isQuoteUsabilityProblem: true,
    isMappingProblem: false,
    isCandidateProblem: false,
    severity: 'warning',
  },
  google_finance_anchor_missing: {
    code: 'google_finance_anchor_missing',
    userTitleKo: 'Google Finance anchor missing',
    userMessageKo: 'Google Finance anchor rows are missing or not configured. Check the Sheets setup first.',
    primaryAction: 'google_finance_setup',
    primaryActionLabelKo: 'Google Finance setup',
    secondaryActions: ['quote_recovery'],
    isGoogleFinanceProblem: true,
    isQuoteUsabilityProblem: true,
    isMappingProblem: false,
    isCandidateProblem: false,
    severity: 'critical',
  },
  google_finance_formula_pending: {
    code: 'google_finance_formula_pending',
    userTitleKo: 'Google Finance formula pending',
    userMessageKo: 'Google Sheets formulas are still calculating. Wait briefly and recheck quote status.',
    primaryAction: 'google_finance_setup',
    primaryActionLabelKo: 'Check formula read-back',
    secondaryActions: ['quote_recovery'],
    isGoogleFinanceProblem: true,
    isQuoteUsabilityProblem: true,
    isMappingProblem: false,
    isCandidateProblem: false,
    severity: 'warning',
  },
  google_finance_readback_partial: {
    code: 'google_finance_readback_partial',
    userTitleKo: 'Google Finance read-back partial',
    userMessageKo: 'Some rows read back from Google Finance, but usable quote coverage is incomplete.',
    primaryAction: 'google_finance_setup',
    primaryActionLabelKo: 'Check read-back',
    secondaryActions: ['quote_recovery', 'ticker_resolver'],
    isGoogleFinanceProblem: true,
    isQuoteUsabilityProblem: true,
    isMappingProblem: false,
    isCandidateProblem: false,
    severity: 'warning',
  },
  quote_rows_missing: {
    code: 'quote_rows_missing',
    userTitleKo: 'Quote rows missing',
    userMessageKo: 'Portfolio quote rows are missing. Run quote recovery and refresh only missing or partial rows.',
    primaryAction: 'quote_recovery',
    primaryActionLabelKo: '시세 상태 확인',
    secondaryActions: ['quote_status_check'],
    isGoogleFinanceProblem: false,
    isQuoteUsabilityProblem: true,
    isMappingProblem: false,
    isCandidateProblem: false,
    severity: 'warning',
  },
  ticker_mapping_required: {
    code: 'ticker_mapping_required',
    userTitleKo: 'Ticker mapping required',
    userMessageKo: 'Stock code, ticker, or Google Finance prefix is missing or ambiguous.',
    primaryAction: 'ticker_resolver',
    primaryActionLabelKo: 'Check ticker mapping',
    secondaryActions: ['quote_status_check'],
    isGoogleFinanceProblem: false,
    isQuoteUsabilityProblem: true,
    isMappingProblem: true,
    isCandidateProblem: false,
    severity: 'warning',
  },
  invalid_symbol: {
    code: 'invalid_symbol',
    userTitleKo: 'Invalid symbol',
    userMessageKo: 'The symbol format is invalid. Check the stock code or US ticker before refreshing quotes.',
    primaryAction: 'ticker_resolver',
    primaryActionLabelKo: 'Fix symbol',
    secondaryActions: [],
    isGoogleFinanceProblem: false,
    isQuoteUsabilityProblem: true,
    isMappingProblem: true,
    isCandidateProblem: false,
    severity: 'warning',
  },
  missing_google_ticker: {
    code: 'missing_google_ticker',
    userTitleKo: 'Missing Google ticker',
    userMessageKo: 'Google Finance ticker is missing, so quote read-back may be incomplete.',
    primaryAction: 'ticker_resolver',
    primaryActionLabelKo: 'Fill ticker',
    secondaryActions: ['quote_status_check'],
    isGoogleFinanceProblem: false,
    isQuoteUsabilityProblem: true,
    isMappingProblem: true,
    isCandidateProblem: false,
    severity: 'warning',
  },
  us_market_feed_missing: {
    code: 'us_market_feed_missing',
    userTitleKo: 'US market feed missing',
    userMessageKo: '미국 시장 feed가 비어 있어 US 후보를 만들 수 없습니다. Google Finance 설정 문제가 아닐 수 있습니다.',
    primaryAction: 'quote_recovery',
    primaryActionLabelKo: 'Run Quote Recovery',
    secondaryActions: ['quote_status_check'],
    isGoogleFinanceProblem: false,
    isQuoteUsabilityProblem: false,
    isMappingProblem: false,
    isCandidateProblem: true,
    severity: 'warning',
  },
  us_signal_mapping_empty: {
    code: 'us_signal_mapping_empty',
    userTitleKo: 'US signal mapping empty',
    userMessageKo: 'US signals exist, but they are not connected to domestic or watchlist candidates. Check theme mapping.',
    primaryAction: 'us_mapping_diagnosis',
    primaryActionLabelKo: 'Watchlist theme mapping',
    secondaryActions: ['theme_mapping_check'],
    isGoogleFinanceProblem: false,
    isQuoteUsabilityProblem: false,
    isMappingProblem: true,
    isCandidateProblem: true,
    severity: 'warning',
  },
  theme_mapping_required: {
    code: 'theme_mapping_required',
    userTitleKo: 'Theme mapping required',
    userMessageKo: 'Watchlist sector/theme mapping is missing or weak.',
    primaryAction: 'theme_mapping_check',
    primaryActionLabelKo: 'Check theme mapping',
    secondaryActions: ['us_mapping_diagnosis'],
    isGoogleFinanceProblem: false,
    isQuoteUsabilityProblem: false,
    isMappingProblem: true,
    isCandidateProblem: true,
    severity: 'warning',
  },
  queue_policy_suppressed: {
    code: 'queue_policy_suppressed',
    userTitleKo: 'Candidate suppressed by queue policy',
    userMessageKo: 'A candidate existed, but repeat exposure, risk review, or data quality moved it out of the primary deck.',
    primaryAction: 'none',
    primaryActionLabelKo: 'Review diagnostics',
    secondaryActions: ['quote_recovery'],
    isGoogleFinanceProblem: false,
    isQuoteUsabilityProblem: false,
    isMappingProblem: false,
    isCandidateProblem: true,
    severity: 'info',
  },
  discovery_universe_empty: {
    code: 'discovery_universe_empty',
    userTitleKo: 'Discovery universe empty',
    userMessageKo: 'Read-only discovery did not find enough resolved candidates.',
    primaryAction: 'discovery_universe_check',
    primaryActionLabelKo: 'Check discovery universe',
    secondaryActions: ['ticker_resolver'],
    isGoogleFinanceProblem: false,
    isQuoteUsabilityProblem: false,
    isMappingProblem: true,
    isCandidateProblem: true,
    severity: 'info',
  },
  insufficient_candidates: {
    code: 'insufficient_candidates',
    userTitleKo: 'Insufficient candidates',
    userMessageKo: 'There are not enough candidates that pass the current observation criteria.',
    primaryAction: 'none',
    primaryActionLabelKo: 'Review data-check slots',
    secondaryActions: ['discovery_universe_check'],
    isGoogleFinanceProblem: false,
    isQuoteUsabilityProblem: false,
    isMappingProblem: false,
    isCandidateProblem: true,
    severity: 'info',
  },
  unknown: {
    code: 'unknown',
    userTitleKo: 'Unknown root cause',
    userMessageKo: 'The system could not classify the quote or candidate blocker yet.',
    primaryAction: 'quote_recovery',
    primaryActionLabelKo: 'Run Quote Recovery',
    secondaryActions: ['quote_status_check'],
    isGoogleFinanceProblem: false,
    isQuoteUsabilityProblem: false,
    isMappingProblem: false,
    isCandidateProblem: false,
    severity: 'warning',
  },
};

export function quoteRootCauseByCode(code: QuoteRootCauseCode | undefined): QuoteRootCause {
  return ROOT_CAUSES[code ?? 'unknown'] ?? ROOT_CAUSES.unknown;
}

export function selectQuoteRootCause(input: {
  googleFinanceConfigured?: boolean;
  matchedQuoteCount?: number;
  missingSymbolCount?: number;
  formulaPendingCount?: number;
  quoteUsabilityStatus?: 'ok' | 'partial' | 'failed' | 'formula_pending' | 'mapping_required' | 'cache_stale';
  rowsMissingGoogleTicker?: number;
  rowsInvalidTicker?: number;
  usMarketDataMissing?: boolean;
  usSignalMappingEmpty?: boolean;
  themeMappingRequired?: boolean;
  queuePolicySuppressed?: boolean;
  discoveryUniverseEmpty?: boolean;
  insufficientCandidates?: boolean;
}): QuoteRootCause {
  if (input.usMarketDataMissing) return ROOT_CAUSES.us_market_feed_missing;
  if (input.usSignalMappingEmpty) return ROOT_CAUSES.us_signal_mapping_empty;
  if (input.themeMappingRequired) return ROOT_CAUSES.theme_mapping_required;
  if (input.quoteUsabilityStatus === 'failed') return ROOT_CAUSES.quote_rows_missing;
  if ((input.rowsInvalidTicker ?? 0) > 0) return ROOT_CAUSES.invalid_symbol;
  if ((input.rowsMissingGoogleTicker ?? 0) > 0) return ROOT_CAUSES.missing_google_ticker;
  if (input.quoteUsabilityStatus === 'mapping_required') return ROOT_CAUSES.ticker_mapping_required;
  if (input.googleFinanceConfigured === false) return ROOT_CAUSES.google_finance_anchor_missing;
  if ((input.formulaPendingCount ?? 0) > 0 || input.quoteUsabilityStatus === 'formula_pending') {
    return ROOT_CAUSES.google_finance_formula_pending;
  }
  if (input.quoteUsabilityStatus === 'partial' || (input.missingSymbolCount ?? 0) > 0) {
    return ROOT_CAUSES.google_finance_readback_partial;
  }
  if ((input.matchedQuoteCount ?? 0) === 0) return ROOT_CAUSES.quote_rows_missing;
  if (input.queuePolicySuppressed) return ROOT_CAUSES.queue_policy_suppressed;
  if (input.discoveryUniverseEmpty) return ROOT_CAUSES.discovery_universe_empty;
  if (input.insufficientCandidates) return ROOT_CAUSES.insufficient_candidates;
  return ROOT_CAUSES.unknown;
}
