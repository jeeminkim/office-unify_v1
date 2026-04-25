import 'server-only';

import { sheetsValuesGet, sheetsValuesUpdate } from '@/lib/server/google-sheets-api';

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

export function normalizeQuoteKey(market: string, symbol: string): string {
  const normalizedMarket = market.trim().toUpperCase();
  const normalizedSymbol = normalizedMarket === 'KR' ? symbol.trim().toUpperCase().padStart(6, '0') : symbol.trim().toUpperCase();
  return `${normalizedMarket}:${normalizedSymbol}`;
}

export function buildGoogleFinanceTickerCandidates(input: HoldingInput): string[] {
  const market = input.market.trim().toUpperCase();
  const symbol = input.symbol.trim().toUpperCase();
  const candidates = new Set<string>();
  if (input.googleTicker?.trim()) candidates.add(input.googleTicker.trim().toUpperCase());
  if (input.quoteSymbol?.trim()) candidates.add(input.quoteSymbol.trim().toUpperCase());
  if (market === 'KR') {
    candidates.add(`KRX:${symbol}`);
    candidates.add(`KRX:${symbol.padStart(6, '0')}`);
    candidates.add(symbol);
  } else {
    candidates.add(symbol);
  }
  return Array.from(candidates);
}

function toGoogleTicker(input: HoldingInput): string {
  const [primary] = buildGoogleFinanceTickerCandidates(input);
  return primary ?? input.symbol.trim().toUpperCase();
}

function asString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function parseSheetNumber(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const raw = asString(v);
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  if (['#N/A', 'N/A', 'LOADING...', '#ERROR!', '#VALUE!', '#REF!'].includes(upper)) return undefined;
  const cleaned = raw.replace(/[₩,\s]/g, '').replace(/[^\d.+-]/g, '');
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  const rows = holdings.map((h, idx) => {
    const r = idx + 2;
    const ticker = toGoogleTicker(h);
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
  const fxRow = holdings.length + 2;
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
      readBackSucceeded: false,
      tabFound: false,
      sheetName: tab,
      spreadsheetIdConfigured: Boolean(id),
      writeConfigured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()),
    };
  }
  const rows: GoogleFinanceQuoteRow[] = [];
  let fxRate: number | undefined;
  values.forEach((row) => {
    const market = asString(row[0]).toUpperCase();
    const symbol = asString(row[1]).toUpperCase();
    if (!market || !symbol) return;
    const googleTicker = asString(row[4]) || toGoogleTickerLegacy(market, symbol);
    const priceFormula = asString(row[5]);
    const rawPrice = asString(row[6]);
    const price = parseSheetNumber(row[6]);
    const datadelay = parseSheetNumber(row[12]);
    const rowStatus = classifyRowStatus(rawPrice, price);
    if (market === 'FX' && symbol === 'USDKRW') {
      fxRate = price;
      return;
    }
    rows.push({
      market,
      symbol,
      normalizedKey: asString(row[3]) || normalizeQuoteKey(market, symbol),
      googleTicker,
      priceFormula,
      rawPrice,
      price,
      currency: asString(row[8]) || undefined,
      rawCurrency: asString(row[8]) || undefined,
      tradetime: asString(row[10]) || undefined,
      rawTradeTime: asString(row[10]) || undefined,
      datadelay,
      rawDelay: asString(row[12]) || undefined,
      rowStatus,
      message: messageForStatus(rowStatus),
      updatedAt: asString(row[14]) || undefined,
    });
  });
  return {
    rows,
    fxRate,
    readBackSucceeded: rows.some((row) => row.price != null),
    tabFound: true,
    sheetName: tab,
    spreadsheetIdConfigured: Boolean(id),
    writeConfigured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()),
  };
}

