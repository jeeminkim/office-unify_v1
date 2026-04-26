import 'server-only';

import { sheetsValuesGet, sheetsValuesUpdate } from '@/lib/server/google-sheets-api';
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
  priceFormula?: string;
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
  const configuredRows = holdings.filter((h) => Boolean(h.googleTicker?.trim()));
  const rows = configuredRows.map((h, idx) => {
    const r = idx + 2;
    const ticker = h.googleTicker!.trim().toUpperCase();
    const normalizedKey = normalizeQuoteKey(h.market, h.symbol);
    return [
      h.market.trim().toUpperCase(),
      h.market === 'KR' ? h.symbol.toUpperCase().padStart(6, '0') : h.symbol.toUpperCase(),
      h.displayName ?? h.symbol.toUpperCase(),
      normalizedKey,
      ticker,
      rowFormula(`E${r}`, 'price'),
      '',
      rowFormula(`E${r}`, 'currency'),
      '',
      rowFormula(`E${r}`, 'tradetime'),
      '',
      rowFormula(`E${r}`, 'datadelay'),
      '',
      '',
      new Date().toISOString(),
    ];
  });
  const fxRow = configuredRows.length + 2;
  rows.push([
    'FX',
    'USDKRW',
    'USDKRW',
    normalizeQuoteKey('FX', 'USDKRW'),
    'CURRENCY:USDKRW',
    rowFormula(`E${fxRow}`, 'price'),
    '',
    rowFormula(`E${fxRow}`, 'currency'),
    '',
    rowFormula(`E${fxRow}`, 'tradetime'),
    '',
    rowFormula(`E${fxRow}`, 'datadelay'),
    '',
    '',
    new Date().toISOString(),
  ]);
  await sheetsValuesUpdate({
    spreadsheetId: id,
    rangeA1: `${tab}!A1`,
    values: [header, ...rows],
    valueInputOption: 'USER_ENTERED',
  });
}

export async function readGoogleFinanceQuoteSheetRows(): Promise<{
  rows: GoogleFinanceQuoteRow[];
  fxRate?: number;
  fxRawPrice?: string;
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
      rangeA1: `${tab}!A2:O500`,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
  } catch {
    values = await sheetsValuesGet({
      spreadsheetId: id,
      rangeA1: `${tab}!A2:O500`,
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
  values.forEach((row) => {
    const market = googleSheetCellAsString(row[0]).toUpperCase();
    const symbol = googleSheetCellAsString(row[1]).toUpperCase();
    if (!market || !symbol) return;
    const googleTicker = googleSheetCellAsString(row[4]) || toGoogleTickerLegacy(market, symbol);
    const priceFormula = googleSheetCellAsString(row[5]);
    const rawPrice = googleSheetCellAsString(row[6]);
    const price = parseGoogleFinanceSheetNumber(row[6]);
    const datadelay = parseGoogleFinanceSheetNumber(row[12]);
    const rowStatus = classifyRowStatus(rawPrice, price);
    if (market === 'FX' && symbol === 'USDKRW') {
      fxRawPrice = rawPrice;
      fxRate = price;
      return;
    }
    rows.push({
      market,
      symbol,
      normalizedKey: googleSheetCellAsString(row[3]) || normalizeQuoteKey(market, symbol),
      googleTicker,
      priceFormula,
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
    fxStatus: classifyFxReadbackStatus(fxRawPrice, fxRate),
    readBackSucceeded: rows.some((row) => row.price != null),
    tabFound: true,
    sheetName: tab,
    spreadsheetIdConfigured: Boolean(id),
    writeConfigured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()),
  };
}

