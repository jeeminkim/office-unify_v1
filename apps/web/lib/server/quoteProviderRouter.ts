import 'server-only';

export type QuoteProviderName =
  | 'google_sheets_googlefinance'
  | 'manual_cache'
  | 'external_us_quote_provider_stub'
  | 'external_kr_quote_provider_stub'
  | 'unavailable';

export type QuoteFreshnessStatus = 'fresh' | 'delayed' | 'stale' | 'unknown' | 'unavailable';
export type QuoteProviderStatus =
  | 'ok'
  | 'stale'
  | 'delayed'
  | 'partial'
  | 'pending'
  | 'failed'
  | 'not_configured'
  | 'unsupported';

export type QuoteProviderRouterFailureReason =
  | 'missing_symbol'
  | 'invalid_symbol'
  | 'missing_google_ticker'
  | 'provider_not_configured'
  | 'provider_timeout'
  | 'formula_pending'
  | 'readback_partial'
  | 'quote_not_returned'
  | 'quote_quality_low'
  | 'stale_cache'
  | 'market_closed'
  | 'unsupported_exchange'
  | 'mapping_missing'
  | 'us_market_feed_missing'
  | 'mapping_required'
  | 'low_confidence_mapping'
  | 'unknown';

export type QuoteProviderPrimaryAction =
  | 'google_finance_setup'
  | 'quote_status_check'
  | 'us_market_feed_check'
  | 'theme_mapping_check'
  | 'quote_provider_status_check'
  | 'ticker_mapping_check'
  | 'wait_for_formula_readback';

export type QuoteProviderResult = {
  provider: QuoteProviderName;
  providerType: 'cache' | 'external_stub' | 'formula_readback' | 'unavailable';
  priority: number;
  configured: boolean;
  used: boolean;
  status: QuoteProviderStatus;
  freshnessStatus: QuoteFreshnessStatus;
  failureReasons: QuoteProviderRouterFailureReason[];
  actionHint: string;
};

export type QuoteProviderRouterSummary = {
  primaryProvider: QuoteProviderName;
  fallbackProvider: QuoteProviderName;
  googleFinanceIsPrimaryRealtimeProvider: false;
  results: QuoteProviderResult[];
  primaryAction: QuoteProviderPrimaryAction;
  primaryActionLabel: string;
  userMessage: string;
  actionHint: string;
  writeAction: false;
};

function googleFinanceReasons(input: {
  googleFinanceConfigured: boolean;
  matchedQuoteCount?: number;
  missingSymbols?: string[];
  formulaPendingCount?: number;
}): QuoteProviderRouterFailureReason[] {
  const reasons: QuoteProviderRouterFailureReason[] = [];
  if (!input.googleFinanceConfigured) reasons.push('provider_not_configured');
  if ((input.formulaPendingCount ?? 0) > 0) reasons.push('formula_pending');
  if ((input.missingSymbols?.length ?? 0) > 0) reasons.push('quote_not_returned', 'readback_partial');
  if (input.googleFinanceConfigured && (input.matchedQuoteCount ?? 0) === 0) reasons.push('quote_not_returned');
  return Array.from(new Set(reasons));
}

export function buildQuoteProviderRouterSummary(input: {
  googleFinanceConfigured: boolean;
  matchedQuoteCount?: number;
  missingSymbols?: string[];
  formulaPendingCount?: number;
  manualCacheFresh?: boolean;
  quoteUsabilityStatus?: 'ok' | 'partial' | 'failed' | 'formula_pending' | 'mapping_required' | 'cache_stale';
  usMarketDataMissing?: boolean;
  usSignalMappingEmpty?: boolean;
  lowConfidenceMapping?: boolean;
}): QuoteProviderRouterSummary {
  const manualCacheFresh = input.manualCacheFresh === true;
  const googleReasons = googleFinanceReasons(input);
  const googleUsed = input.googleFinanceConfigured && (input.matchedQuoteCount ?? 0) > 0;
  const googlePartial = input.googleFinanceConfigured && (input.missingSymbols?.length ?? 0) > 0;
  const primaryProvider: QuoteProviderName = manualCacheFresh ? 'manual_cache' : 'google_sheets_googlefinance';

  const results: QuoteProviderResult[] = [
    {
      provider: 'manual_cache',
      providerType: 'cache',
      priority: 1,
      configured: manualCacheFresh,
      used: manualCacheFresh,
      status: manualCacheFresh ? 'ok' : 'not_configured',
      freshnessStatus: manualCacheFresh ? 'fresh' : 'unavailable',
      failureReasons: manualCacheFresh ? [] : ['provider_not_configured'],
      actionHint: manualCacheFresh
        ? 'Fresh server cache is available for quote read-back.'
        : 'No fresh server quote cache is configured in this release.',
    },
    {
      provider: 'external_us_quote_provider_stub',
      providerType: 'external_stub',
      priority: 2,
      configured: false,
      used: false,
      status: 'not_configured',
      freshnessStatus: 'unavailable',
      failureReasons: ['provider_not_configured'],
      actionHint: 'US realtime provider is not configured yet; candidates must show this as a quote-provider limitation.',
    },
    {
      provider: 'external_kr_quote_provider_stub',
      providerType: 'external_stub',
      priority: 3,
      configured: false,
      used: false,
      status: 'not_configured',
      freshnessStatus: 'unavailable',
      failureReasons: ['provider_not_configured'],
      actionHint: 'KR realtime provider is not configured yet; Google Sheets remains an ops read-back fallback.',
    },
    {
      provider: 'google_sheets_googlefinance',
      providerType: 'formula_readback',
      priority: 4,
      configured: input.googleFinanceConfigured,
      used: !manualCacheFresh && googleUsed,
      status: !input.googleFinanceConfigured
        ? 'not_configured'
        : (input.formulaPendingCount ?? 0) > 0
          ? 'pending'
          : googlePartial
            ? 'partial'
            : googleUsed
              ? 'delayed'
              : 'failed',
      freshnessStatus: googleUsed ? 'delayed' : input.googleFinanceConfigured ? 'unknown' : 'unavailable',
      failureReasons: googleReasons,
      actionHint: input.googleFinanceConfigured
        ? 'Google Sheets GOOGLEFINANCE is formula read-back fallback, not a realtime primary quote provider.'
        : 'Google Sheets GOOGLEFINANCE is not configured.',
    },
  ];

  const actionHint = manualCacheFresh
    ? 'Quotes are using fresh cache first; Google Sheets is only a fallback.'
    : googleUsed
      ? 'Google Sheets read-back supplied usable quotes, but it is still delayed formula read-back.'
      : 'No primary realtime quote provider is configured. Show provider_not_configured, mapping, and read-back reasons separately.';

  const primaryAction = selectPrimaryAction({
    googleFinanceConfigured: input.googleFinanceConfigured,
    googleUsed,
    formulaPendingCount: input.formulaPendingCount ?? 0,
    quoteUsabilityStatus: input.quoteUsabilityStatus,
    usMarketDataMissing: input.usMarketDataMissing === true,
    usSignalMappingEmpty: input.usSignalMappingEmpty === true,
    lowConfidenceMapping: input.lowConfidenceMapping === true,
  });
  const actionCopy = primaryActionCopy(primaryAction);

  return {
    primaryProvider,
    fallbackProvider: 'google_sheets_googlefinance',
    googleFinanceIsPrimaryRealtimeProvider: false,
    results,
    primaryAction,
    primaryActionLabel: actionCopy.label,
    userMessage: actionCopy.message,
    actionHint,
    writeAction: false,
  };
}

function selectPrimaryAction(input: {
  googleFinanceConfigured: boolean;
  googleUsed: boolean;
  formulaPendingCount: number;
  quoteUsabilityStatus?: 'ok' | 'partial' | 'failed' | 'formula_pending' | 'mapping_required' | 'cache_stale';
  usMarketDataMissing: boolean;
  usSignalMappingEmpty: boolean;
  lowConfidenceMapping: boolean;
}): QuoteProviderPrimaryAction {
  if (!input.googleFinanceConfigured) return 'google_finance_setup';
  if (input.formulaPendingCount > 0 || input.quoteUsabilityStatus === 'formula_pending') return 'wait_for_formula_readback';
  if (input.usMarketDataMissing) return 'us_market_feed_check';
  if (input.usSignalMappingEmpty) return 'theme_mapping_check';
  if (input.quoteUsabilityStatus === 'mapping_required' || input.lowConfidenceMapping) return 'ticker_mapping_check';
  if (
    input.quoteUsabilityStatus === 'failed' ||
    input.quoteUsabilityStatus === 'partial' ||
    input.quoteUsabilityStatus === 'cache_stale' ||
    (input.googleUsed && input.quoteUsabilityStatus !== 'ok')
  ) {
    return 'quote_status_check';
  }
  return 'quote_provider_status_check';
}

function primaryActionCopy(action: QuoteProviderPrimaryAction): { label: string; message: string } {
  switch (action) {
    case 'google_finance_setup':
      return {
        label: 'Google Finance 설정',
        message: 'Google Sheets anchor 또는 formula read-back 설정이 비어 있습니다.',
      };
    case 'quote_status_check':
      return {
        label: '시세 상태 확인',
        message: 'Google Finance anchor는 확인됐지만 실제 quote usable 상태가 낮습니다.',
      };
    case 'us_market_feed_check':
      return {
        label: 'US market feed 상태 확인',
        message: '미국 시장 feed를 가져오지 못했습니다. Google Finance 설정 문제가 아닐 수 있습니다.',
      };
    case 'theme_mapping_check':
      return {
        label: '테마 연결 / Watchlist sector-theme 확인',
        message: '미국 신호가 국내/관련 후보로 연결되지 않았습니다.',
      };
    case 'ticker_mapping_check':
      return {
        label: 'ticker/sector mapping 확인',
        message: '종목 코드, ticker, Google Finance prefix 또는 sector mapping 확인이 필요합니다.',
      };
    case 'wait_for_formula_readback':
      return {
        label: '30~60초 뒤 상태 재확인',
        message: 'Google Sheets formula 계산 대기 또는 일부 read-back 미완료 상태입니다.',
      };
    case 'quote_provider_status_check':
    default:
      return {
        label: 'Quote Provider 상태 확인',
        message: '실시간 quote provider가 아직 설정되지 않았습니다. Sheets는 지연 read-back fallback입니다.',
      };
  }
}
