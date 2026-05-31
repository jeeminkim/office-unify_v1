import 'server-only';

import { buildA1Range, ensureSheetTab, sheetsValuesGet, sheetsValuesUpdate } from '@/lib/server/google-sheets-api';
import {
  classifyFxReadbackStatus,
  googleSheetCellAsString,
  normalizeQuoteKey,
  parseGoogleFinanceSheetNumber,
  type FxReadbackStatus,
} from '@/lib/server/quoteReadbackUtils';
import { normalizeKoreanGoogleTicker, normalizeUsGoogleTicker } from '@/lib/server/quotePipelineDiagnostics';

type HoldingInput = {
  market: string;
  symbol: string;
  displayName?: string;
  quoteSymbol?: string;
  googleTicker?: string;
};

export type GoogleFinanceQuoteRow = {
  /** 1-based Sheets row number (header = 1). */
  sheetRowNumber?: number;
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
  /** simplified layout status 열 (H) */
  sheetStatus?: string;
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
  return (
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() ||
    process.env.GOOGLE_SPREADSHEET_ID?.trim() ||
    null
  );
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
    const normalized = normalizeKoreanGoogleTicker(symbol, market);
    if (normalized.googleTicker) candidates.add(normalized.googleTicker);
    if (normalized.quoteSymbol) candidates.add(normalized.quoteSymbol);
    const pad = symbol.replace(/\D/g, '').padStart(6, '0');
    if (/^\d{6}$/.test(pad)) {
      candidates.add(`KRX:${pad}`);
      candidates.add(`KOSDAQ:${pad}`);
    }
    candidates.add(symbol);
  } else {
    const normalized = normalizeUsGoogleTicker(symbol);
    if (normalized.googleTicker) candidates.add(normalized.googleTicker);
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

function inferMarketFromGoogleTicker(googleTicker: string, symbol: string): string {
  const gt = googleTicker.trim().toUpperCase();
  if (gt.startsWith('KRX:') || gt.startsWith('KOSDAQ:') || gt.startsWith('KOSPI:')) return 'KR';
  if (/^\d{6}$/.test(symbol.trim())) return 'KR';
  return 'US';
}

type PortfolioQuotesColumnMap = Map<string, number>;

function buildPortfolioQuotesColumnMap(headerRow: unknown[]): PortfolioQuotesColumnMap {
  const map = new Map<string, number>();
  headerRow.forEach((cell, idx) => {
    const key = String(cell ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    if (key) map.set(key, idx);
  });
  return map;
}

function colIndex(map: PortfolioQuotesColumnMap, ...names: string[]): number | undefined {
  for (const n of names) {
    const i = map.get(n);
    if (i != null) return i;
  }
  return undefined;
}

function cellAt(row: unknown[], idx: number | undefined): unknown {
  if (idx == null || idx < 0) return undefined;
  return row[idx];
}

export function isSimplifiedPortfolioQuotesLayout(headerRow: unknown[]): boolean {
  const map = buildPortfolioQuotesColumnMap(headerRow);
  if (map.has('symbol') && map.has('google_ticker')) return true;
  const first = String(headerRow[0] ?? '')
    .trim()
    .toLowerCase();
  return first === 'symbol';
}

function resolveSimplifiedRowStatus(
  rawPrice: string,
  price: number | undefined,
  sheetStatus: string,
): GoogleFinanceQuoteRow['rowStatus'] {
  const st = sheetStatus.trim().toLowerCase();
  if (st === 'ok') return 'ok';
  if (st === 'pending' || st === 'missing') return 'formula_pending';
  if (st === 'empty') return 'empty_price';
  if (price != null && price > 0) return 'ok';
  return classifyRowStatus(rawPrice, price);
}

function parseSimplifiedPortfolioQuoteRows(values: unknown[][], headerRow: unknown[]): GoogleFinanceQuoteRow[] {
  const map = buildPortfolioQuotesColumnMap(headerRow);
  const symIdx = colIndex(map, 'symbol') ?? 0;
  const gtIdx = colIndex(map, 'google_ticker') ?? 1;
  const priceIdx = colIndex(map, 'price') ?? 2;
  const timeIdx = colIndex(map, 'tradetime') ?? 6;
  const statusIdx = colIndex(map, 'status') ?? 7;

  const rows: GoogleFinanceQuoteRow[] = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i]!;
    const sheetRowNumber = i + 2;
    const symbol = googleSheetCellAsString(cellAt(row, symIdx)).toUpperCase();
    const googleTicker = googleSheetCellAsString(cellAt(row, gtIdx)).toUpperCase();
    if (!symbol || symbol === 'SYMBOL') continue;
    const market = inferMarketFromGoogleTicker(googleTicker, symbol);
    const rawPrice = googleSheetCellAsString(cellAt(row, priceIdx));
    const price = parseGoogleFinanceSheetNumber(cellAt(row, priceIdx));
    const sheetStatus = googleSheetCellAsString(cellAt(row, statusIdx));
    const rowStatus = resolveSimplifiedRowStatus(rawPrice, price, sheetStatus);
    rows.push({
      sheetRowNumber,
      market,
      symbol,
      normalizedKey: normalizeQuoteKey(market, symbol),
      googleTicker: googleTicker || toGoogleTickerLegacy(market, symbol),
      rawPrice,
      price,
      sheetStatus: sheetStatus || undefined,
      tradetime: googleSheetCellAsString(cellAt(row, timeIdx)) || undefined,
      rawTradeTime: googleSheetCellAsString(cellAt(row, timeIdx)) || undefined,
      rowStatus,
      message: messageForStatus(rowStatus),
    });
  }
  return rows;
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
  let headerRow: unknown[] = [];
  try {
    const headerPeek = await sheetsValuesGet({
      spreadsheetId: id,
      rangeA1: buildA1Range(tab, 'A1:J1'),
      valueRenderOption: 'FORMATTED_VALUE',
    });
    headerRow = headerPeek[0] ?? [];
  } catch {
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

  const simplifiedLayout = isSimplifiedPortfolioQuotesLayout(headerRow);
  let values: unknown[][];
  try {
    values = await sheetsValuesGet({
      spreadsheetId: id,
      rangeA1: buildA1Range(tab, simplifiedLayout ? 'A2:J500' : 'A2:O500'),
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
  } catch {
    values = await sheetsValuesGet({
      spreadsheetId: id,
      rangeA1: buildA1Range(tab, simplifiedLayout ? 'A2:J500' : 'A2:O500'),
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
  }

  if (simplifiedLayout) {
    const rows = parseSimplifiedPortfolioQuoteRows(values, headerRow);
    return {
      rows,
      fxRate: undefined,
      fxRawPrice: undefined,
      fxRowDetail: undefined,
      fxStatus: 'missing',
      readBackSucceeded: rows.some((row) => row.price != null && row.price > 0),
      tabFound: true,
      sheetName: tab,
      spreadsheetIdConfigured: Boolean(id),
      writeConfigured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()),
    };
  }

  if (values.length === 0) {
    return {
      rows: [],
      fxRate: undefined,
      fxRawPrice: undefined,
      fxStatus: 'missing',
      readBackSucceeded: false,
      tabFound: true,
      sheetName: tab,
      spreadsheetIdConfigured: Boolean(id),
      writeConfigured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()),
    };
  }
  return parseLegacyPortfolioQuoteRows(values, {
    fxOut: true,
    tab,
    id,
  });
}

export async function readGoogleFinanceQuoteSheetFormulaRows(): Promise<{
  rows: Array<{
    sheetRowNumber: number;
    symbol: string;
    googleTicker: string;
    priceFormula?: string;
    statusFormula?: string;
  }>;
  tabFound: boolean;
  sheetName: string;
}> {
  const id = spreadsheetId();
  if (!id) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set');
  const tab = tabName();
  let headerRow: unknown[] = [];
  try {
    const headerPeek = await sheetsValuesGet({
      spreadsheetId: id,
      rangeA1: buildA1Range(tab, 'A1:J1'),
      valueRenderOption: 'FORMULA',
    });
    headerRow = headerPeek[0] ?? [];
  } catch {
    return { rows: [], tabFound: false, sheetName: tab };
  }
  if (!isSimplifiedPortfolioQuotesLayout(headerRow)) return { rows: [], tabFound: true, sheetName: tab };

  const values = await sheetsValuesGet({
    spreadsheetId: id,
    rangeA1: buildA1Range(tab, 'A2:J500'),
    valueRenderOption: 'FORMULA',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });
  const map = buildPortfolioQuotesColumnMap(headerRow);
  const symIdx = colIndex(map, 'symbol') ?? 0;
  const gtIdx = colIndex(map, 'google_ticker') ?? 1;
  const priceIdx = colIndex(map, 'price') ?? 2;
  const statusIdx = colIndex(map, 'status') ?? 7;
  return {
    tabFound: true,
    sheetName: tab,
    rows: values
      .map((row, idx) => ({
        sheetRowNumber: idx + 2,
        symbol: googleSheetCellAsString(cellAt(row, symIdx)).toUpperCase(),
        googleTicker: googleSheetCellAsString(cellAt(row, gtIdx)).toUpperCase(),
        priceFormula: googleSheetCellAsString(cellAt(row, priceIdx)) || undefined,
        statusFormula: googleSheetCellAsString(cellAt(row, statusIdx)) || undefined,
      }))
      .filter((row) => row.symbol.length > 0 && row.symbol !== 'SYMBOL'),
  };
}

function parseLegacyPortfolioQuoteRows(
  values: unknown[][],
  ctx?: { fxOut: true; tab: string; id: string },
): {
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
} {
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
    sheetName: ctx?.tab ?? '',
    spreadsheetIdConfigured: Boolean(ctx?.id),
    writeConfigured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()),
  };
}
