import 'server-only';

import { US_MARKET_SEED_ANCHORS } from '@/lib/server/usMarketMorningSummary';
import { buildUsMarketMorningSummary } from '@/lib/server/usMarketMorningSummary';
import {
  isGoogleFinanceQuoteConfigured,
  readGoogleFinanceQuoteSheetRows,
} from '@/lib/server/googleFinanceSheetQuoteService';

export type GoogleFinanceSetupCheckResult = {
  readOnly: true;
  status: 'ok' | 'degraded' | 'failed' | 'not_configured';
  generatedAt: string;
  expectedTabs: string[];
  portfolioQuotesTab: {
    configuredName: string;
    tabFound: boolean;
    readSucceeded: boolean;
    rowCount: number;
    okRows: number;
    parseFailedRows: number;
    missingRows: number;
  };
  usAnchor: {
    requested: number;
    ok: number;
    coverageLabel: string;
    fetchFailed: boolean;
    emptyReason?: string;
    results: Array<{ key: string; label: string; googleTicker: string; ok: boolean }>;
  };
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

export async function runGoogleFinanceSetupCheck(): Promise<GoogleFinanceSetupCheckResult> {
  const generatedAt = new Date().toISOString();
  const configured = isGoogleFinanceQuoteConfigured();
  const sheetName = process.env.PORTFOLIO_QUOTES_SHEET_NAME?.trim() || 'portfolio_quotes';
  const warnings: string[] = [];

  let tabFound = false;
  let readSucceeded = false;
  let rowCount = 0;
  let okRows = 0;
  let parseFailedRows = 0;
  let missingRows = 0;

  if (configured) {
    try {
      const data = await readGoogleFinanceQuoteSheetRows();
      tabFound = data.tabFound ?? true;
      readSucceeded = true;
      rowCount = data.rows.length;
      for (const row of data.rows) {
        if (row.rowStatus === 'ok') okRows += 1;
        else if (row.rowStatus === 'parse_failed') parseFailedRows += 1;
        else missingRows += 1;
      }
    } catch (e: unknown) {
      warnings.push(e instanceof Error ? e.message : 'sheet_read_failed');
      readSucceeded = false;
    }
  } else {
    warnings.push('googlefinance_not_configured');
  }

  const usSummary = await buildUsMarketMorningSummary();
  const diag = usSummary.diagnostics;
  const anchorRequested = diag?.anchorSymbolsRequested ?? US_MARKET_SEED_ANCHORS.length;
  const anchorOk = diag?.yahooQuoteResultCount ?? 0;
  const anchorResults = US_MARKET_SEED_ANCHORS.slice(0, 8).map((a) => ({
    key: a.key,
    label: a.label,
    googleTicker: a.googleTicker,
    ok: Boolean(
      usSummary.signals?.some((s) => s.signalKey === a.key || s.label === a.label),
    ),
  }));

  let status: GoogleFinanceSetupCheckResult['status'] = 'ok';
  if (!configured) status = 'not_configured';
  else if (!readSucceeded || anchorOk === 0) status = 'failed';
  else if (anchorOk < anchorRequested * 0.5 || parseFailedRows > 0) status = 'degraded';

  return {
    readOnly: true,
    status,
    generatedAt,
    expectedTabs: EXPECTED_TABS,
    portfolioQuotesTab: {
      configuredName: sheetName,
      tabFound,
      readSucceeded,
      rowCount,
      okRows,
      parseFailedRows,
      missingRows,
    },
    usAnchor: {
      requested: anchorRequested,
      ok: anchorOk,
      coverageLabel: `${anchorOk}/${anchorRequested}`,
      fetchFailed: Boolean(diag?.fetchFailed),
      emptyReason: diag?.emptyReason,
      results: anchorResults,
    },
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
      { label: 'portfolio_quotes tab', description: `${sheetName} 탭이 존재하고 range가 맞는지 확인` },
      { label: 'US anchor 시세', description: 'SPY/QQQ/SMH 등 anchor 셀에 숫자가 표시되는지 확인' },
      { label: 'GOOGLEFINANCE 수식', description: '#N/A·#REF! 없이 price가 계산되는지 확인' },
      { label: 'ticker 형식', description: '관심종목 google_ticker·quote_symbol 매핑 확인' },
      { label: 'Today Brief 재확인', description: 'refresh 후 Dashboard 미국 점검 카드 anchor 개선 확인' },
    ],
    actionHint:
      status === 'not_configured'
        ? 'GOOGLE_SERVICE_ACCOUNT_JSON·GOOGLE_SHEETS_SPREADSHEET_ID를 설정하세요. 이 화면은 Sheets를 자동 수정하지 않습니다.'
        : anchorOk === 0
          ? '미국 anchor가 0개입니다. Google Sheets / GOOGLEFINANCE를 먼저 점검하세요. 미국 종목은 일반 관찰 후보로 쓰지 않습니다.'
          : '시세는 Google Finance read-back 검증용입니다. 섹터/테마는 registry·수동 검토와 병행하세요.',
    warnings,
  };
}
