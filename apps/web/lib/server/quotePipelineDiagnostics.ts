import type { GoogleFinanceQuoteRow } from '@/lib/server/googleFinanceSheetQuoteService';
import { normalizeQuoteKey } from '@/lib/server/quoteReadbackUtils';
import type { QuoteProviderCapability } from '@office-unify/shared-types';

export type QuoteUsabilityStatus =
  | 'ok'
  | 'partial'
  | 'failed'
  | 'formula_pending'
  | 'mapping_required'
  | 'cache_stale';

export type QuoteFailureReason =
  | 'missing_google_ticker'
  | 'invalid_symbol'
  | 'unsupported_exchange_prefix'
  | 'formula_pending'
  | 'googlefinance_no_data'
  | 'stale_readback'
  | 'parse_failed'
  | 'price_not_numeric'
  | 'row_empty'
  | 'duplicate_symbol'
  | 'quote_quality_low'
  | 'missing_row'
  | 'mapping_required';

export type PortfolioQuoteDiagnosticHolding = {
  market: string;
  symbol: string;
  name?: string | null;
  google_ticker?: string | null;
  quote_symbol?: string | null;
};

export type TickerMappingDiagnosis = {
  inputSymbol: string;
  market?: string;
  status: 'ok' | 'invalid_symbol' | 'mapping_required' | 'unsupported_exchange_prefix';
  googleTicker?: string;
  quoteSymbol?: string;
  reason?: QuoteFailureReason;
  actionHint: string;
};

export type PortfolioQuoteReadbackDiagnostics = {
  rowsTotal: number;
  rowsParsed: number;
  rowsWithPrice: number;
  rowsWithFormula: number;
  rowsFormulaPending: number;
  rowsInvalidTicker: number;
  rowsMissingGoogleTicker: number;
  rowsMissingPrice: number;
  rowsStale: number;
  domesticRowsOk: number;
  usRowsOk: number;
  anchorRowsOk: number;
  nonAnchorRowsOk: number;
  failedSymbols: string[];
  failedReasonsBySymbol: Record<string, QuoteFailureReason[]>;
  quoteUsabilityStatus: QuoteUsabilityStatus;
  providerCapability: QuoteProviderCapability;
  actionHint: string;
};

const US_GOOGLE_TICKER_ALIASES: Record<string, string> = {
  SPY: 'NYSEARCA:SPY',
  DIA: 'NYSEARCA:DIA',
  IWM: 'NYSEARCA:IWM',
  XLK: 'NYSEARCA:XLK',
  XLF: 'NYSEARCA:XLF',
  XLE: 'NYSEARCA:XLE',
  XLI: 'NYSEARCA:XLI',
  XLY: 'NYSEARCA:XLY',
  QQQ: 'NASDAQ:QQQ',
  SMH: 'NASDAQ:SMH',
  SOXX: 'NASDAQ:SOXX',
  TSLA: 'NASDAQ:TSLA',
  NVDA: 'NASDAQ:NVDA',
  AAPL: 'NASDAQ:AAPL',
  MSFT: 'NASDAQ:MSFT',
  NFLX: 'NASDAQ:NFLX',
};

export function buildGoogleFinanceProviderCapability(): QuoteProviderCapability {
  return {
    provider: 'google_sheets_googlefinance',
    providerType: 'formula_readback',
    realtime: false,
    expectedDelay: 'delayed_or_unknown',
    failureModes: ['formula_pending', 'no_data', 'mapping_required', 'cache_stale', 'provider_delay'],
    userMessage:
      '현재 시세는 Google Sheets GOOGLEFINANCE 수식 read-back 기반입니다. 실시간 API가 아니므로 계산 지연 또는 빈 값이 발생할 수 있습니다.',
  };
}

export function normalizeKoreanGoogleTicker(symbol: string, market?: string | null): TickerMappingDiagnosis {
  const raw = symbol.trim().toUpperCase();
  if (!/^\d{6}$/.test(raw)) {
    return {
      inputSymbol: symbol,
      market: market ?? undefined,
      status: 'invalid_symbol',
      reason: 'invalid_symbol',
      actionHint: '국내 종목 코드는 숫자 6자리여야 합니다. 원장 symbol을 먼저 확인하세요.',
    };
  }

  const normalizedMarket = (market ?? '').trim().toUpperCase();
  if (normalizedMarket === 'KOSPI' || normalizedMarket === 'KS') {
    return {
      inputSymbol: symbol,
      market: normalizedMarket,
      status: 'ok',
      googleTicker: `KRX:${raw}`,
      quoteSymbol: `${raw}.KS`,
      actionHint: 'KOSPI 종목은 KRX:xxxxxx 형식을 우선 사용합니다.',
    };
  }
  if (normalizedMarket === 'KOSDAQ' || normalizedMarket === 'KQ') {
    return {
      inputSymbol: symbol,
      market: normalizedMarket,
      status: 'ok',
      googleTicker: `KOSDAQ:${raw}`,
      quoteSymbol: `${raw}.KQ`,
      actionHint: 'KOSDAQ 종목은 KOSDAQ:xxxxxx 형식을 우선 확인합니다.',
    };
  }
  if (normalizedMarket === 'KR') {
    return {
      inputSymbol: symbol,
      market: normalizedMarket,
      status: 'mapping_required',
      googleTicker: `KRX:${raw}`,
      quoteSymbol: `${raw}.KS`,
      reason: 'mapping_required',
      actionHint: 'KOSPI/KOSDAQ 구분이 없어 기본 KRX 후보만 제시합니다. 저장은 사용자가 확인한 뒤에만 하세요.',
    };
  }
  return {
    inputSymbol: symbol,
    market: normalizedMarket || undefined,
    status: 'mapping_required',
    reason: 'mapping_required',
    actionHint: '시장 구분이 없어 Google Finance prefix를 확정할 수 없습니다.',
  };
}

export function normalizeUsGoogleTicker(symbol: string): TickerMappingDiagnosis {
  const raw = symbol.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,12}$/.test(raw)) {
    return {
      inputSymbol: symbol,
      market: 'US',
      status: 'invalid_symbol',
      reason: 'invalid_symbol',
      actionHint: '미국 ticker 형식을 확인하세요.',
    };
  }
  return {
    inputSymbol: symbol,
    market: 'US',
    status: 'ok',
    googleTicker: US_GOOGLE_TICKER_ALIASES[raw] ?? raw,
    quoteSymbol: raw,
    actionHint: '미국 ticker는 anchor alias registry와 일관되게 사용합니다.',
  };
}

function hasFormula(row: GoogleFinanceQuoteRow): boolean {
  return Boolean(row.priceFormulaText?.trim() || row.googleTicker?.trim());
}

function isAnchorRow(row: GoogleFinanceQuoteRow): boolean {
  const gt = row.googleTicker.trim().toUpperCase();
  const sym = row.symbol.trim().toUpperCase();
  return Boolean(US_GOOGLE_TICKER_ALIASES[sym] || Object.values(US_GOOGLE_TICKER_ALIASES).includes(gt));
}

function reasonForHolding(
  holding: PortfolioQuoteDiagnosticHolding,
  row: GoogleFinanceQuoteRow | undefined,
): QuoteFailureReason[] {
  const reasons: QuoteFailureReason[] = [];
  const market = holding.market.trim().toUpperCase();
  const symbol = holding.symbol.trim().toUpperCase();
  if (market === 'KR' && !/^\d{6}$/.test(symbol)) reasons.push('invalid_symbol');
  if (!holding.google_ticker?.trim()) reasons.push('missing_google_ticker');
  if (!row) {
    reasons.push('missing_row');
    return reasons;
  }
  if (row.rowStatus === 'formula_pending') reasons.push('formula_pending');
  if (row.rowStatus === 'ticker_mismatch') reasons.push('googlefinance_no_data');
  if (row.rowStatus === 'parse_failed') reasons.push('parse_failed');
  if (row.rowStatus === 'empty_price') reasons.push(row.rawPrice ? 'price_not_numeric' : 'row_empty');
  if (row.price == null || row.price <= 0) reasons.push('quote_quality_low');
  return Array.from(new Set(reasons));
}

export function buildPortfolioQuoteReadbackDiagnostics(input: {
  holdings: PortfolioQuoteDiagnosticHolding[];
  rows: GoogleFinanceQuoteRow[];
}): PortfolioQuoteReadbackDiagnostics {
  const rowByKey = new Map(input.rows.map((row) => [normalizeQuoteKey(row.market, row.symbol), row]));
  const failedReasonsBySymbol: Record<string, QuoteFailureReason[]> = {};
  for (const h of input.holdings) {
    const key = normalizeQuoteKey(h.market, h.symbol);
    const reasons = reasonForHolding(h, rowByKey.get(key));
    if (reasons.length > 0) failedReasonsBySymbol[key] = reasons;
  }

  const rowsWithPrice = input.rows.filter((row) => row.price != null && row.price > 0).length;
  const rowsFormulaPending = input.rows.filter((row) => row.rowStatus === 'formula_pending').length;
  const rowsMissingPrice = input.rows.filter((row) => row.price == null || row.price <= 0).length;
  const rowsInvalidTicker = input.holdings.filter(
    (h) => h.market.trim().toUpperCase() === 'KR' && !/^\d{6}$/.test(h.symbol.trim().toUpperCase()),
  ).length;
  const rowsMissingGoogleTicker = input.holdings.filter((h) => !h.google_ticker?.trim()).length;
  const domesticRowsOk = input.rows.filter((row) => row.market === 'KR' && row.price != null && row.price > 0).length;
  const usRowsOk = input.rows.filter((row) => row.market === 'US' && row.price != null && row.price > 0).length;
  const anchorRowsOk = input.rows.filter((row) => isAnchorRow(row) && row.price != null && row.price > 0).length;
  const nonAnchorRowsOk = input.rows.filter((row) => !isAnchorRow(row) && row.price != null && row.price > 0).length;
  const failedSymbols = Object.keys(failedReasonsBySymbol);

  let quoteUsabilityStatus: QuoteUsabilityStatus = 'ok';
  if (rowsFormulaPending > 0) quoteUsabilityStatus = 'formula_pending';
  else if (input.holdings.length > 0 && rowsWithPrice === 0) quoteUsabilityStatus = 'failed';
  else if (rowsMissingGoogleTicker > 0 || rowsInvalidTicker > 0) quoteUsabilityStatus = 'mapping_required';
  else if (failedSymbols.length > 0 || rowsMissingPrice > 0) quoteUsabilityStatus = 'partial';

  const actionHint =
    quoteUsabilityStatus === 'ok'
      ? 'portfolio_quotes read-back이 사용 가능한 상태입니다.'
      : quoteUsabilityStatus === 'formula_pending'
        ? 'Google Finance 계산 대기 상태입니다. 30~60초 뒤 상태를 다시 확인하세요.'
        : quoteUsabilityStatus === 'mapping_required'
          ? 'google_ticker 또는 국내/미국 ticker mapping을 확인해야 합니다. 자동 저장은 하지 않습니다.'
          : quoteUsabilityStatus === 'failed'
            ? '시세 read-back이 실패했습니다. ticker mapping과 Google Finance 계산 상태를 확인하세요.'
            : '일부 종목만 시세가 확인되었습니다. 실패 symbol의 reason을 먼저 확인하세요.';

  return {
    rowsTotal: input.rows.length,
    rowsParsed: input.rows.length,
    rowsWithPrice,
    rowsWithFormula: input.rows.filter(hasFormula).length,
    rowsFormulaPending,
    rowsInvalidTicker,
    rowsMissingGoogleTicker,
    rowsMissingPrice,
    rowsStale: 0,
    domesticRowsOk,
    usRowsOk,
    anchorRowsOk,
    nonAnchorRowsOk,
    failedSymbols,
    failedReasonsBySymbol,
    quoteUsabilityStatus,
    providerCapability: buildGoogleFinanceProviderCapability(),
    actionHint,
  };
}

export function refreshLifecycleFromDiagnostics(input: {
  refreshedCount: number;
  diagnostics?: PortfolioQuoteReadbackDiagnostics;
}): Array<{ step: string; status: 'done' | 'running' | 'pending' | 'degraded' | 'failed'; message: string }> {
  const d = input.diagnostics;
  return [
    { step: 'requested', status: 'done', message: '시세 새로고침이 요청되었습니다.' },
    {
      step: 'sheets_recalculation_wait',
      status: d?.rowsFormulaPending ? 'running' : 'pending',
      message: 'Google Finance 수식 계산은 지연될 수 있습니다.',
    },
    {
      step: 'readback_started',
      status: d ? 'done' : 'pending',
      message: 'portfolio_quotes read-back 상태를 확인합니다.',
    },
    {
      step: d?.quoteUsabilityStatus === 'ok' ? 'readback_ok' : 'readback_partial',
      status: d?.quoteUsabilityStatus === 'ok' ? 'done' : d ? 'degraded' : 'pending',
      message: d?.actionHint ?? '30~60초 뒤 시세 상태를 다시 확인하세요.',
    },
    {
      step: input.refreshedCount > 0 ? 'cache_updated' : 'cache_stale',
      status: input.refreshedCount > 0 ? 'done' : 'degraded',
      message: input.refreshedCount > 0 ? '시트 갱신 요청이 반영되었습니다.' : '갱신할 google_ticker 보유 행이 없습니다.',
    },
  ];
}
