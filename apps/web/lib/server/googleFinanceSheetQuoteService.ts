import 'server-only';

import {
  buildA1Range,
  ensureSheetTab,
  sheetsValuesBatchGet,
  sheetsValuesBatchUpdate,
  sheetsValuesGet,
} from '@/lib/server/google-sheets-api';
import {
  classifyFxReadbackStatus,
  googleSheetCellAsString,
  normalizeQuoteKey,
  parseGoogleFinanceSheetNumber,
  type FxReadbackStatus,
} from '@/lib/server/quoteReadbackUtils';

type HoldingInput = {
  market: string;
  symbol: string;
  displayName?: string;
  quoteSymbol?: string;
  googleTicker?: string;
};

export type GoogleFinanceQuoteRow = {
  market: string;
  symbol: string;
  normalizedKey: string;
  googleTicker: string;
  /** F열 수식 문자열(FORMULA read-back) */
  priceFormula?: string;
  currencyFormula?: string;
  tradetimeFormula?: string;
  datadelayFormula?: string;
  rawPrice?: string;
  price?: number;
  currency?: string;
  rawCurrency?: string;
  tradetime?: string;
  rawTradeTime?: string;
  datadelay?: number;
  rawDelay?: string;
  rowStatus?: 'ok' | 'formula_pending' | 'empty_price' | 'parse_failed' | 'ticker_mismatch' | 'missing_row';
  message?: string;
  updatedAt?: string;
};

/** portfolio_quotes FX 행 read-back(수식 F/H/J/L, 값 G/I/K/M). */
export type GoogleFinanceFxRowReadback = {
  priceFormula?: string;
  currencyFormula?: string;
  tradetimeFormula?: string;
  datadelayFormula?: string;
  rawPrice?: string;
  price?: number;
  currency?: string;
  tradetime?: string;
  datadelay?: number;
  rawDelay?: string;
};

function spreadsheetId(): string | null {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || null;
}

function tabName(): string {
  return process.env.PORTFOLIO_QUOTES_SHEET_NAME?.trim() || 'portfolio_quotes';
}

export { normalizeQuoteKey, parseGoogleFinanceSheetNumber, googleSheetCellAsString, classifyFxReadbackStatus, type FxReadbackStatus };

export function buildGoogleFinanceTickerCandidates(input: HoldingInput): string[] {
  const market = input.market.trim().toUpperCase();
  const symbol = input.symbol.trim().toUpperCase();
  const candidates = new Set<string>();
  if (input.googleTicker?.trim()) candidates.add(input.googleTicker.trim().toUpperCase());
  if (input.quoteSymbol?.trim()) candidates.add(input.quoteSymbol.trim().toUpperCase());
  if (market === 'KR') {
    const pad = symbol.padStart(6, '0');
    candidates.add(`KRX:${symbol}`);
    candidates.add(`KRX:${pad}`);
    candidates.add(`KOSDAQ:${pad}`);
    candidates.add(`KOSPI:${pad}`);
    candidates.add(symbol);
  } else {
    candidates.add(symbol);
  }
  return Array.from(candidates);
}


function classifyRowStatus(rawPrice: string, parsedPrice: number | undefined): GoogleFinanceQuoteRow['rowStatus'] {
  if (parsedPrice != null && parsedPrice > 0) return 'ok';
  if (!rawPrice) return 'formula_pending';
  const upper = rawPrice.toUpperCase();
  if (upper.includes('LOADING')) return 'formula_pending';
  if (['#N/A', 'N/A'].includes(upper)) return 'ticker_mismatch';
  if (upper.startsWith('#')) return 'parse_failed';
  return 'empty_price';
}

function rowFormula(tickerCell: string, field: 'price' | 'currency' | 'tradetime' | 'datadelay'): string {
  return `=IFERROR(GOOGLEFINANCE(${tickerCell},"${field}"),)`;
}

/** FX 행 E열 고정 값(status API·안내 문구와 동일하게 유지). */
export const PORTFOLIO_QUOTES_FX_GOOGLE_TICKER = 'CURRENCY:USDKRW';

/** F열 기대 수식(안내·검증용). */
export const PORTFOLIO_QUOTES_FX_PRICE_FORMULA_EXPECTED =
  '=IFERROR(GOOGLEFINANCE("CURRENCY:USDKRW","price"),)';

/** CURRENCY:USDKRW가 비어 있을 때 시트에서 시도할 수 있는 대체 price 관련 수식 예시. */
export function portfolioQuotesFxAlternativePriceFormulas(): string[] {
  return ['=GOOGLEFINANCE("CURRENCY:USDKRW")', '=GOOGLEFINANCE("CURRENCY:USDKRW","price")'];
}

/** FX 행: E에 티커 문자열을 두고 수식에서는 리터럴을 사용(사용자 스펙과 동일). */
function fxRowFormula(field: 'price' | 'currency' | 'tradetime' | 'datadelay'): string {
  return `=IFERROR(GOOGLEFINANCE("CURRENCY:USDKRW","${field}"),)`;
}

function messageForStatus(status: GoogleFinanceQuoteRow['rowStatus']): string | undefined {
  if (status === 'formula_pending') return 'Sheets 계산 대기 또는 미반영';
  if (status === 'empty_price') return '가격 셀이 비어 있습니다';
  if (status === 'parse_failed') return '가격 값을 숫자로 파싱하지 못했습니다';
  if (status === 'ticker_mismatch') return 'Google ticker 형식 확인이 필요합니다';
  if (status === 'missing_row') return 'portfolio_quotes 시트에서 종목 행을 찾지 못했습니다';
  return undefined;
}

async function readQuoteFormulaColumns(
  spreadsheetId: string,
  tab: string,
): Promise<[unknown[][], unknown[][], unknown[][], unknown[][]]> {
  try {
    const batch = await sheetsValuesBatchGet({
      spreadsheetId,
      rangesA1: [
        buildA1Range(tab, 'F2:F500'),
        buildA1Range(tab, 'H2:H500'),
        buildA1Range(tab, 'J2:J500'),
        buildA1Range(tab, 'L2:L500'),
      ],
      valueRenderOption: 'FORMULA',
    });
    return [
      batch[0] ?? [],
      batch[1] ?? [],
      batch[2] ?? [],
      batch[3] ?? [],
    ];
  } catch {
    return [[], [], [], []];
  }
}

function toGoogleTickerLegacy(market: string, symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (market === 'KR') {
    if (/^\d{6}$/.test(s)) return `KRX:${s}`;
    return `KRX:${s}`;
  }
  return s;
}

export function isGoogleFinanceQuoteConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() && spreadsheetId());
}

export async function syncGoogleFinanceQuoteSheetRows(holdings: HoldingInput[]): Promise<void> {
  const id = spreadsheetId();
  if (!id) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set');
  const tab = tabName();
  const header = [
    'market',
    'symbol',
    'name',
    'normalized_key',
    'google_ticker',
    'price_formula',
    'price',
    'currency_formula',
    'currency',
    'tradetime_formula',
    'tradetime',
    'datadelay_formula',
    'datadelay',
    'status',
    'last_synced_at',
  ];
  await ensureSheetTab({
    spreadsheetId: id,
    title: tab,
    header,
  });
  const configuredRows = holdings.filter((h) => Boolean(h.googleTicker?.trim()));
  type BuiltRow = {
    a2e: [string, string, string, string, string];
    priceF: string;
    currencyH: string;
    tradetimeJ: string;
    datadelayL: string;
    no: [string, string];
  };
  const built: BuiltRow[] = configuredRows.map((h, idx) => {
    const r = idx + 2;
    const ticker = h.googleTicker!.trim().toUpperCase();
    const normalizedKey = normalizeQuoteKey(h.market, h.symbol);
    return {
      a2e: [
        h.market.trim().toUpperCase(),
        h.market === 'KR' ? h.symbol.toUpperCase().padStart(6, '0') : h.symbol.toUpperCase(),
        h.displayName ?? h.symbol.toUpperCase(),
        normalizedKey,
        ticker,
      ],
      priceF: rowFormula(`E${r}`, 'price'),
      currencyH: rowFormula(`E${r}`, 'currency'),
      tradetimeJ: rowFormula(`E${r}`, 'tradetime'),
      datadelayL: rowFormula(`E${r}`, 'datadelay'),
      no: ['', new Date().toISOString()],
    };
  });
  built.push({
    a2e: ['FX', 'USDKRW', 'USDKRW', normalizeQuoteKey('FX', 'USDKRW'), PORTFOLIO_QUOTES_FX_GOOGLE_TICKER],
    priceF: fxRowFormula('price'),
    currencyH: fxRowFormula('currency'),
    tradetimeJ: fxRowFormula('tradetime'),
    datadelayL: fxRowFormula('datadelay'),
    no: ['', new Date().toISOString()],
  });
  const lastRow = 1 + built.length;
  const batchMain: Array<{ rangeA1: string; values: string[][] }> = [
    { rangeA1: buildA1Range(tab, 'A1:O1'), values: [header] },
    { rangeA1: buildA1Range(tab, `A2:E${lastRow}`), values: built.map((b) => [...b.a2e]) },
    { rangeA1: buildA1Range(tab, `F2:F${lastRow}`), values: built.map((b) => [b.priceF]) },
    { rangeA1: buildA1Range(tab, `H2:H${lastRow}`), values: built.map((b) => [b.currencyH]) },
    { rangeA1: buildA1Range(tab, `J2:J${lastRow}`), values: built.map((b) => [b.tradetimeJ]) },
    { rangeA1: buildA1Range(tab, `L2:L${lastRow}`), values: built.map((b) => [b.datadelayL]) },
    { rangeA1: buildA1Range(tab, `N2:O${lastRow}`), values: built.map((b) => [...b.no]) },
  ];
  await sheetsValuesBatchUpdate({
    spreadsheetId: id,
    valueInputOption: 'USER_ENTERED',
    data: batchMain,
  });
  // FX 행만 재확인: E/F/H/J/L 고정 스펙을 마지막에 한 번 더 씀(G/I/K/M 미포함).
  await sheetsValuesBatchUpdate({
    spreadsheetId: id,
    valueInputOption: 'USER_ENTERED',
    data: [
      { rangeA1: buildA1Range(tab, `E${lastRow}:E${lastRow}`), values: [[PORTFOLIO_QUOTES_FX_GOOGLE_TICKER]] },
      { rangeA1: buildA1Range(tab, `F${lastRow}:F${lastRow}`), values: [[fxRowFormula('price')]] },
      { rangeA1: buildA1Range(tab, `H${lastRow}:H${lastRow}`), values: [[fxRowFormula('currency')]] },
      { rangeA1: buildA1Range(tab, `J${lastRow}:J${lastRow}`), values: [[fxRowFormula('tradetime')]] },
      { rangeA1: buildA1Range(tab, `L${lastRow}:L${lastRow}`), values: [[fxRowFormula('datadelay')]] },
    ],
  });
}

export async function readGoogleFinanceQuoteSheetRows(): Promise<{
  rows: GoogleFinanceQuoteRow[];
  fxRate?: number;
  fxRawPrice?: string;
  fxRowDetail?: GoogleFinanceFxRowReadback;
  fxStatus: FxReadbackStatus;
  readBackSucceeded: boolean;
  tabFound: boolean;
  sheetName: string;
  spreadsheetIdConfigured: boolean;
  writeConfigured: boolean;
}> {
  const id = spreadsheetId();
  if (!id) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set');
  const tab = tabName();
  let values: unknown[][];
  try {
    values = await sheetsValuesGet({
      spreadsheetId: id,
      rangeA1: buildA1Range(tab, 'A2:O500'),
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
  } catch {
    values = await sheetsValuesGet({
      spreadsheetId: id,
      rangeA1: buildA1Range(tab, 'A2:O500'),
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
  }
  const [fFormulas, hFormulas, jFormulas, lFormulas] = await readQuoteFormulaColumns(id, tab);
  if (values.length === 0) {
    return {
      rows: [],
      fxRate: undefined,
      fxRawPrice: undefined,
      fxStatus: 'missing',
      readBackSucceeded: false,
      tabFound: false,
      sheetName: tab,
      spreadsheetIdConfigured: Boolean(id),
      writeConfigured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()),
    };
  }
  const rows: GoogleFinanceQuoteRow[] = [];
  let fxRate: number | undefined;
  let fxRawPrice: string | undefined;
  let fxRowDetail: GoogleFinanceFxRowReadback | undefined;
  values.forEach((row, rowIdx) => {
    const market = googleSheetCellAsString(row[0]).toUpperCase();
    const symbol = googleSheetCellAsString(row[1]).toUpperCase();
    if (!market || !symbol) return;
    const googleTicker = googleSheetCellAsString(row[4]) || toGoogleTickerLegacy(market, symbol);
    const priceFormula = googleSheetCellAsString(fFormulas[rowIdx]?.[0]) || undefined;
    const currencyFormula = googleSheetCellAsString(hFormulas[rowIdx]?.[0]) || undefined;
    const tradetimeFormula = googleSheetCellAsString(jFormulas[rowIdx]?.[0]) || undefined;
    const datadelayFormula = googleSheetCellAsString(lFormulas[rowIdx]?.[0]) || undefined;
    const rawPriceG = googleSheetCellAsString(row[6]);
    const rawPriceLegacyF = googleSheetCellAsString(row[5]);
    const rawPrice = rawPriceG || rawPriceLegacyF;
    const price = parseGoogleFinanceSheetNumber(rawPriceG || rawPriceLegacyF);
    const datadelay = parseGoogleFinanceSheetNumber(row[12]);
    const rowStatus = classifyRowStatus(rawPrice, price);
    if (market === 'FX' && symbol === 'USDKRW') {
      fxRawPrice = rawPrice;
      fxRate = price;
      fxRowDetail = {
        priceFormula,
        currencyFormula,
        tradetimeFormula,
        datadelayFormula,
        rawPrice,
        price,
        currency: googleSheetCellAsString(row[8]) || undefined,
        tradetime: googleSheetCellAsString(row[10]) || undefined,
        datadelay: parseGoogleFinanceSheetNumber(row[12]),
        rawDelay: googleSheetCellAsString(row[12]) || undefined,
      };
      return;
    }
    rows.push({
      market,
      symbol,
      normalizedKey: googleSheetCellAsString(row[3]) || normalizeQuoteKey(market, symbol),
      googleTicker,
      priceFormula,
      currencyFormula,
      tradetimeFormula,
      datadelayFormula,
      rawPrice,
      price,
      currency: googleSheetCellAsString(row[8]) || undefined,
      rawCurrency: googleSheetCellAsString(row[8]) || undefined,
      tradetime: googleSheetCellAsString(row[10]) || undefined,
      rawTradeTime: googleSheetCellAsString(row[10]) || undefined,
      datadelay,
      rawDelay: googleSheetCellAsString(row[12]) || undefined,
      rowStatus,
      message: messageForStatus(rowStatus),
      updatedAt: googleSheetCellAsString(row[14]) || undefined,
    });
  });
  return {
    rows,
    fxRate,
    fxRawPrice,
    fxRowDetail,
    fxStatus: classifyFxReadbackStatus(fxRawPrice, fxRate),
    readBackSucceeded: rows.some((row) => row.price != null),
    tabFound: true,
    sheetName: tab,
    spreadsheetIdConfigured: Boolean(id),
    writeConfigured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()),
  };
}

