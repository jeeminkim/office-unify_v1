import 'server-only';

import { US_MARKET_SEED_ANCHORS, fetchUsMarketYahooQuoteMap } from '@/lib/server/usMarketMorningSummary';
import {
  isGoogleFinanceQuoteConfigured,
  readGoogleFinanceQuoteSheetRows,
  type GoogleFinanceQuoteRow,
} from '@/lib/server/googleFinanceSheetQuoteService';

export type GoogleFinanceQuoteSource =
  | 'google_sheets_readback'
  | 'yahoo_fallback'
  | 'internal_cache'
  | 'unknown';

export type GoogleFinanceAnchorReadbackStatus =
  | 'ok'
  | 'missing'
  | 'parse_failed'
  | 'stale'
  | 'unsupported'
  | 'unknown';

export type GoogleFinanceAnchorResult = {
  key: string;
  label: string;
  symbol: string;
  googleTicker: string;
  expectedFormula: string;
  readbackPrice?: number;
  readbackName?: string;
  readbackStatus: GoogleFinanceAnchorReadbackStatus;
  source: GoogleFinanceQuoteSource;
  lastCheckedAt: string;
  actionHint?: string;
  /** @deprecated use readbackStatus + source — Sheets read-back OK only */
  ok: boolean;
};

export type GoogleFinanceSetupCheckResult = {
  readOnly: true;
  status: 'ok' | 'degraded' | 'failed' | 'not_configured';
  generatedAt: string;
  overallQuoteSource: GoogleFinanceQuoteSource | 'mixed';
  expectedTabs: string[];
  portfolioQuotesTab: {
    configuredName: string;
    tabFound: boolean;
    readSucceeded: boolean;
    readbackUnavailable: boolean;
    rowCount: number;
    okRows: number;
    parseFailedRows: number;
    missingRows: number;
  };
  usAnchor: {
    requested: number;
    /** Sheets read-back OK count (not Yahoo) */
    ok: number;
    coverageLabel: string;
    fetchFailed: boolean;
    emptyReason?: string;
    summary: {
      sheetsAnchorOk: number;
      fallbackOnly: number;
      missing: number;
      rangeOrPermissionError: number;
    };
    results: GoogleFinanceAnchorResult[];
  };
  usMarketGatingNote: string;
  sampleFormulas: string[];
  sampleTable: {
    columns: string[];
    exampleRow: Record<string, string>;
  };
  setupChecklist: Array<{ label: string; description: string }>;
  actionHint: string;
  warnings: string[];
};

const EXPECTED_TABS = [
  process.env.PORTFOLIO_QUOTES_SHEET_NAME?.trim() || 'portfolio_quotes',
  'US_Anchor',
  'sector_radar_quotes',
  'portfolio_quote_candidates',
];

const SAMPLE_FORMULAS = [
  '=GOOGLEFINANCE("NYSEARCA:SPY","price")',
  '=GOOGLEFINANCE("NASDAQ:QQQ","price")',
  '=GOOGLEFINANCE("NASDAQ:TSLA","price")',
  '=GOOGLEFINANCE("NASDAQ:NVDA","price")',
  '=GOOGLEFINANCE("NASDAQ:AAPL","price")',
  '=GOOGLEFINANCE("NASDAQ:MSFT","price")',
  '=GOOGLEFINANCE("KRX:005930","price")',
  '=GOOGLEFINANCE("KRX:000660","price")',
];

const ANCHOR_SAMPLE_COUNT = 18;

function expectedFormula(googleTicker: string): string {
  return `=GOOGLEFINANCE("${googleTicker}","price")`;
}

function findSheetRowForAnchor(rows: GoogleFinanceQuoteRow[], anchor: (typeof US_MARKET_SEED_ANCHORS)[number]) {
  const want = new Set(
    [anchor.googleTicker, anchor.quoteSymbol, anchor.key].map((s) => s.trim().toUpperCase()).filter(Boolean),
  );
  for (const row of rows) {
    const gt = row.googleTicker?.trim().toUpperCase() ?? '';
    const sym = row.symbol?.trim().toUpperCase() ?? '';
    const key = row.normalizedKey?.toUpperCase() ?? '';
    if (want.has(gt) || want.has(sym) || key.includes(anchor.quoteSymbol)) return row;
  }
  return null;
}

function mapRowToReadbackStatus(row: GoogleFinanceQuoteRow | null): GoogleFinanceAnchorReadbackStatus {
  if (!row) return 'missing';
  switch (row.rowStatus) {
    case 'ok':
      return 'ok';
    case 'parse_failed':
      return 'parse_failed';
    case 'formula_pending':
      return 'stale';
    case 'ticker_mismatch':
      return 'unsupported';
    case 'empty_price':
    case 'missing_row':
      return 'missing';
    default:
      return 'unknown';
  }
}

function sourceLabel(source: GoogleFinanceQuoteSource, status: GoogleFinanceAnchorReadbackStatus): string {
  if (source === 'google_sheets_readback' && status === 'ok') return 'Sheets read-back OK';
  if (source === 'yahoo_fallback') return 'Fallback only';
  if (status === 'missing') return 'Sheets missing';
  if (status === 'parse_failed') return 'Range parse failed';
  if (status === 'unsupported') return 'Unsupported attribute';
  if (status === 'stale') return 'Formula pending';
  return 'Unknown';
}

export async function runGoogleFinanceSetupCheck(): Promise<GoogleFinanceSetupCheckResult> {
  const generatedAt = new Date().toISOString();
  const configured = isGoogleFinanceQuoteConfigured();
  const sheetName = process.env.PORTFOLIO_QUOTES_SHEET_NAME?.trim() || 'portfolio_quotes';
  const warnings: string[] = [];

  let tabFound = false;
  let readSucceeded = false;
  let readbackUnavailable = false;
  let rowCount = 0;
  let okRows = 0;
  let parseFailedRows = 0;
  let missingRows = 0;
  let sheetRows: GoogleFinanceQuoteRow[] = [];

  if (configured) {
    try {
      const data = await readGoogleFinanceQuoteSheetRows();
      tabFound = data.tabFound ?? true;
      readSucceeded = true;
      sheetRows = data.rows;
      rowCount = data.rows.length;
      for (const row of data.rows) {
        if (row.rowStatus === 'ok') okRows += 1;
        else if (row.rowStatus === 'parse_failed') parseFailedRows += 1;
        else missingRows += 1;
      }
    } catch (e: unknown) {
      readbackUnavailable = true;
      warnings.push(e instanceof Error ? e.message : 'sheet_read_failed');
      readSucceeded = false;
    }
  } else {
    readbackUnavailable = true;
    warnings.push('googlefinance_not_configured');
  }

  const anchors = US_MARKET_SEED_ANCHORS.slice(0, ANCHOR_SAMPLE_COUNT);
  const anchorSymbols = anchors.map((a) => a.quoteSymbol);
  let yahooFailed = true;
  let yahooMap = new Map<string, { regularMarketPrice?: number }>();
  try {
    const yahoo = await fetchUsMarketYahooQuoteMap(anchorSymbols);
    yahooMap = yahoo.map;
    yahooFailed = yahoo.fetchFailed;
  } catch {
    yahooFailed = true;
  }

  let sheetsAnchorOk = 0;
  let fallbackOnly = 0;
  let missing = 0;
  let rangeOrPermissionError = 0;

  const results: GoogleFinanceAnchorResult[] = anchors.map((anchor) => {
    const row = readSucceeded ? findSheetRowForAnchor(sheetRows, anchor) : null;
    let readbackStatus = mapRowToReadbackStatus(row);
    let source: GoogleFinanceQuoteSource = 'unknown';
    let readbackPrice: number | undefined = row?.price;
    let actionHint: string | undefined;

    if (row && readbackStatus === 'ok' && readbackPrice != null && readbackPrice > 0) {
      source = 'google_sheets_readback';
      sheetsAnchorOk += 1;
    } else if (readbackStatus === 'parse_failed') {
      source = readSucceeded ? 'google_sheets_readback' : 'unknown';
      rangeOrPermissionError += 1;
      actionHint = 'Sheets 셀에 #REF!·#N/A가 없는지, range와 ticker prefix를 확인하세요.';
    } else if (!readSucceeded || !row) {
      const yahooRow = yahooMap.get(anchor.quoteSymbol.toUpperCase());
      const yPrice = Number(yahooRow?.regularMarketPrice ?? NaN);
      if (!yahooFailed && Number.isFinite(yPrice) && yPrice > 0) {
        source = 'yahoo_fallback';
        readbackStatus = 'missing';
        readbackPrice = yPrice;
        fallbackOnly += 1;
        actionHint =
          'fallback 데이터는 확인됐지만 Google Sheets read-back은 확인되지 않았습니다. Google Sheets에서 샘플 수식을 직접 확인하세요.';
      } else {
        source = 'unknown';
        missing += 1;
        actionHint = readbackUnavailable
          ? 'Sheets read-back을 사용할 수 없습니다. GOOGLE_SHEETS_SPREADSHEET_ID·서비스 계정을 확인하세요.'
          : `${anchor.googleTicker} 행이 portfolio_quotes에 없습니다. 샘플 수식을 붙여 넣으세요.`;
      }
    } else if (readbackStatus === 'stale') {
      source = 'google_sheets_readback';
      missing += 1;
      actionHint = 'GOOGLEFINANCE 계산이 대기 중일 수 있습니다. 1분 후 refresh·재확인하세요.';
    } else {
      source = 'google_sheets_readback';
      missing += 1;
      actionHint = 'price 셀이 비어 있으면 ticker prefix·수식 attribute를 확인하세요.';
    }

    const ok = readbackStatus === 'ok' && source === 'google_sheets_readback';

    return {
      key: anchor.key,
      label: anchor.label,
      symbol: anchor.quoteSymbol,
      googleTicker: anchor.googleTicker,
      expectedFormula: expectedFormula(anchor.googleTicker),
      readbackPrice,
      readbackStatus,
      source,
      lastCheckedAt: generatedAt,
      actionHint: actionHint ? `${sourceLabel(source, readbackStatus)} — ${actionHint}` : sourceLabel(source, readbackStatus),
      ok,
    };
  });

  const anchorRequested = anchors.length;
  let overallQuoteSource: GoogleFinanceSetupCheckResult['overallQuoteSource'] = 'unknown';
  if (sheetsAnchorOk > 0 && fallbackOnly > 0) overallQuoteSource = 'mixed';
  else if (sheetsAnchorOk > 0) overallQuoteSource = 'google_sheets_readback';
  else if (fallbackOnly > 0) overallQuoteSource = 'yahoo_fallback';
  else overallQuoteSource = 'unknown';

  let status: GoogleFinanceSetupCheckResult['status'] = 'ok';
  if (!configured || readbackUnavailable) status = 'not_configured';
  else if (sheetsAnchorOk === 0 && fallbackOnly === 0) status = 'failed';
  else if (fallbackOnly > 0 || sheetsAnchorOk < anchorRequested * 0.5 || parseFailedRows > 0) status = 'degraded';

  const usMarketGatingNote =
    'US 후보 일반 노출은 Sheets read-back 또는 신뢰 가능한 quote source가 충분할 때만 허용됩니다. anchor가 0이면 TSLA/NFLX 등은 일반 관찰 후보가 아니라 데이터 점검 카드로 분리됩니다.';

  return {
    readOnly: true,
    status,
    generatedAt,
    overallQuoteSource,
    expectedTabs: EXPECTED_TABS,
    portfolioQuotesTab: {
      configuredName: sheetName,
      tabFound,
      readSucceeded,
      readbackUnavailable: readbackUnavailable || !configured,
      rowCount,
      okRows,
      parseFailedRows,
      missingRows,
    },
    usAnchor: {
      requested: anchorRequested,
      ok: sheetsAnchorOk,
      coverageLabel: `${sheetsAnchorOk}/${anchorRequested}`,
      fetchFailed: yahooFailed && !readSucceeded,
      emptyReason: sheetsAnchorOk === 0 ? (fallbackOnly > 0 ? 'fallback_only' : 'anchors_empty') : undefined,
      summary: {
        sheetsAnchorOk,
        fallbackOnly,
        missing,
        rangeOrPermissionError,
      },
      results,
    },
    usMarketGatingNote,
    sampleFormulas: SAMPLE_FORMULAS,
    sampleTable: {
      columns: ['symbol', 'google_ticker', 'price', 'name', 'volume', 'marketcap', 'tradetime', 'status'],
      exampleRow: {
        symbol: 'SPY',
        google_ticker: 'NYSEARCA:SPY',
        price: '=GOOGLEFINANCE("NYSEARCA:SPY","price")',
        name: 'S&P 500 ETF',
        volume: '',
        marketcap: '',
        tradetime: '=GOOGLEFINANCE("NYSEARCA:SPY","tradetime")',
        status: 'ok',
      },
    },
    setupChecklist: [
      { label: 'us_market_quotes / portfolio_quotes tab', description: `${sheetName} 탭 존재·range 확인` },
      { label: 'SPY/QQQ/TSLA 샘플 수식', description: '직접 입력 후 price 숫자 표시 확인' },
      { label: 'ticker prefix', description: 'NYSEARCA/NASDAQ/KRX prefix 확인' },
      { label: 'status 컬럼', description: 'ok / parse_failed 구분' },
      { label: 'Today Brief 재확인', description: 'refresh 후 Dashboard 미국 점검 카드' },
    ],
    actionHint:
      status === 'not_configured'
        ? 'GOOGLE_SERVICE_ACCOUNT_JSON·GOOGLE_SHEETS_SPREADSHEET_ID를 설정하세요. 이 화면은 Sheets를 자동 수정하지 않습니다.'
        : sheetsAnchorOk === 0 && fallbackOnly > 0
          ? 'Yahoo fallback만 확인됐습니다. Google Sheets GOOGLEFINANCE read-back을 직접 점검하세요. 미국 종목은 일반 후보로 쓰지 않습니다.'
          : sheetsAnchorOk === 0
            ? '미국 anchor Sheets read-back이 0개입니다. 샘플 수식·tab·range를 확인하세요.'
            : status === 'degraded'
              ? '일부 anchor만 Sheets OK입니다. fallback only 항목은 Sheets에서 직접 확인하세요.'
              : 'Sheets read-back이 충분합니다. 시세는 검증용이며 섹터/테마는 registry·수동 검토와 병행하세요.',
    warnings,
  };
}
