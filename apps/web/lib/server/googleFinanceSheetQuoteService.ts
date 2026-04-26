import 'server-only';

import { buildA1Range, ensureSheetTab, sheetsValuesGet, sheetsValuesUpdate } from '@/lib/server/google-sheets-api';
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
  /** F열: 사람이 읽는 수식 설명(텍스트) */
  priceFormulaText?: string;
  currencyFormulaText?: string;
  tradetimeFormulaText?: string;
  datadelayFormulaText?: string;
  /** G/I/K/M에서 읽은 표시값 */
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

/** portfolio_quotes FX 행 read-back(G=가격, F=설명 텍스트). */
export type GoogleFinanceFxRowReadback = {
  priceFormulaText?: string;
  currencyFormulaText?: string;
  tradetimeFormulaText?: string;
  datadelayFormulaText?: string;
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

/** Sheets USER_ENTERED: 선행 ' 는 셀을 텍스트로 두고 화면에는 수식 문자열만 보이게 함. */
function asFormulaHintText(formula: string): string {
  const t = formula.trim();
  if (t.startsWith("'")) return t;
  return `'${t}`;
}

function rowResultFormulaEr(tickerCell: string, field: 'price' | 'currency' | 'tradetime' | 'datadelay'): string {
  return `=IFERROR(GOOGLEFINANCE(${tickerCell},"${field}"),)`;
}

/** FX 행 E열 고정 값 */
export const PORTFOLIO_QUOTES_FX_GOOGLE_TICKER = 'CURRENCY:USDKRW';

/** G열 기대 계산 수식(안내·검증용) — attribute 없음 */
export const PORTFOLIO_QUOTES_FX_PRICE_RESULT_FORMULA_EXPECTED = '=GOOGLEFINANCE("CURRENCY:USDKRW")';

export function portfolioQuotesFxAlternativePriceFormulas(): string[] {
  return ['=IFERROR(GOOGLEFINANCE("CURRENCY:USDKRW"),)', '=GOOGLEFINANCE("CURRENCY:USDKRW","price")'];
}

function messageForStatus(status: GoogleFinanceQuoteRow['rowStatus']): string | undefined {
  if (status === 'formula_pending') return 'Sheets 계산 대기 또는 미반영';
  if (status === 'empty_price') return '가격 셀이 비어 있습니다';
  if (status === 'parse_failed') return '가격 값을 숫자로 파싱하지 못했습니다';
  if (status === 'ticker_mismatch') return 'Google ticker 형식 확인이 필요합니다';
  if (status === 'missing_row') return 'portfolio_quotes 시트에서 종목 행을 찾지 못했습니다';
  return undefined;
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
    'price_formula_text',
    'price_result_formula',
    'currency_formula_text',
    'currency_result_formula',
    'tradetime_formula_text',
    'tradetime_result_formula',
    'datadelay_formula_text',
    'datadelay_result_formula',
    'status',
    'last_synced_at',
  ];
  await ensureSheetTab({
    spreadsheetId: id,
    title: tab,
    header,
  });
  const configuredRows = holdings.filter((h) => Boolean(h.googleTicker?.trim()));
  const syncedAt = new Date().toISOString();
  const body: string[][] = configuredRows.map((h, idx) => {
    const r = idx + 2;
    const ticker = h.googleTicker!.trim().toUpperCase();
    const normalizedKey = normalizeQuoteKey(h.market, h.symbol);
    const eCell = `E${r}`;
    const gPrice = rowResultFormulaEr(eCell, 'price');
    const gCur = rowResultFormulaEr(eCell, 'currency');
    const gTime = rowResultFormulaEr(eCell, 'tradetime');
    const gDelay = rowResultFormulaEr(eCell, 'datadelay');
    return [
      h.market.trim().toUpperCase(),
      h.market === 'KR' ? h.symbol.toUpperCase().padStart(6, '0') : h.symbol.toUpperCase(),
      h.displayName ?? h.symbol.toUpperCase(),
      normalizedKey,
      ticker,
      asFormulaHintText(gPrice),
      gPrice,
      asFormulaHintText(gCur),
      gCur,
      asFormulaHintText(gTime),
      gTime,
      asFormulaHintText(gDelay),
      gDelay,
      '',
      syncedAt,
    ];
  });
  const fxG = '=GOOGLEFINANCE("CURRENCY:USDKRW")';
  body.push([
    'FX',
    'USDKRW',
    'USDKRW',
    normalizeQuoteKey('FX', 'USDKRW'),
    PORTFOLIO_QUOTES_FX_GOOGLE_TICKER,
    asFormulaHintText(fxG),
    fxG,
    `'FX currency`,
    'KRW',
    `'FX tradetime unsupported`,
    '',
    `'FX datadelay unsupported`,
    '',
    '',
    syncedAt,
  ]);
  const lastRow = 1 + body.length;
  await sheetsValuesUpdate({
    spreadsheetId: id,
    rangeA1: buildA1Range(tab, `A1:O${lastRow}`),
    values: [header, ...body],
    valueInputOption: 'USER_ENTERED',
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
  values.forEach((row) => {
    const market = googleSheetCellAsString(row[0]).toUpperCase();
    const symbol = googleSheetCellAsString(row[1]).toUpperCase();
    if (!market || !symbol) return;
    const googleTicker = googleSheetCellAsString(row[4]) || toGoogleTickerLegacy(market, symbol);
    const priceFormulaText = googleSheetCellAsString(row[5]) || undefined;
    const currencyFormulaText = googleSheetCellAsString(row[7]) || undefined;
    const tradetimeFormulaText = googleSheetCellAsString(row[9]) || undefined;
    const datadelayFormulaText = googleSheetCellAsString(row[11]) || undefined;
    const rawPrice = googleSheetCellAsString(row[6]);
    const price = parseGoogleFinanceSheetNumber(row[6]);
    const datadelay = parseGoogleFinanceSheetNumber(row[12]);
    const rowStatus = classifyRowStatus(rawPrice, price);
    if (market === 'FX' && symbol === 'USDKRW') {
      fxRawPrice = rawPrice;
      fxRate = price;
      const curRaw = googleSheetCellAsString(row[8]);
      fxRowDetail = {
        priceFormulaText,
        currencyFormulaText,
        tradetimeFormulaText,
        datadelayFormulaText,
        rawPrice,
        price,
        currency: curRaw || 'KRW',
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
      priceFormulaText,
      currencyFormulaText,
      tradetimeFormulaText,
      datadelayFormulaText,
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
