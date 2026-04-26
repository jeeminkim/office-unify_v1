import 'server-only';

import { buildA1Range, ensureSheetTab, sheetsValuesGet, sheetsValuesUpdate } from '@/lib/server/google-sheets-api';
import {
  googleSheetCellAsString,
  parseGoogleFinanceSheetNumber,
} from '@/lib/server/googleFinanceSheetQuoteService';

function spreadsheetId(): string | null {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || null;
}

function candidatesTab(): string {
  return process.env.PORTFOLIO_TICKER_CANDIDATES_SHEET_NAME?.trim() || 'portfolio_quote_candidates';
}

const HEADER: string[] = [
  'request_id',
  'target_type',
  'market',
  'symbol',
  'name',
  'candidate_ticker',
  'price_formula',
  'price',
  'currency_formula',
  'currency',
  'name_formula',
  'google_name',
  'tradetime_formula',
  'tradetime',
  'datadelay_formula',
  'datadelay',
  'status',
  'confidence',
  'message',
  'created_at',
];

export type CandidateSheetWriteRow = {
  requestId: string;
  targetType: 'holding' | 'watchlist';
  market: string;
  symbol: string;
  name: string;
  candidateTicker: string;
  confidence: 'high' | 'medium' | 'low';
  message: string;
};

export type CandidateSheetParsedRow = {
  requestId: string;
  targetType: 'holding' | 'watchlist';
  market: string;
  symbol: string;
  name?: string;
  candidateTicker: string;
  rawPrice?: string;
  parsedPrice?: number;
  currency?: string;
  googleName?: string;
  tradeTime?: string;
  delayMinutes?: number;
  sheetConfidence: 'high' | 'medium' | 'low';
  sheetMessage?: string;
  createdAt?: string;
};

export function isTickerCandidateSheetConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() && spreadsheetId());
}

function gfFormula(rowIndex1Based: number, field: 'price' | 'currency' | 'name' | 'tradetime' | 'datadelay'): string {
  return `=IFERROR(GOOGLEFINANCE(F${rowIndex1Based},"${field}"),)`;
}

export async function appendTickerCandidateSheetRows(rows: CandidateSheetWriteRow[]): Promise<void> {
  const id = spreadsheetId();
  if (!id) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set');
  const tab = candidatesTab();
  if (rows.length === 0) return;
  await ensureSheetTab({
    spreadsheetId: id,
    title: tab,
    header: HEADER,
  });

  const firstCell = await sheetsValuesGet({
    spreadsheetId: id,
    rangeA1: buildA1Range(tab, 'A1:A1'),
  });
  const a1 = firstCell[0]?.[0];
  if (googleSheetCellAsString(a1) !== 'request_id') {
    await sheetsValuesUpdate({
      spreadsheetId: id,
      rangeA1: buildA1Range(tab, 'A1:T1'),
      values: [HEADER],
      valueInputOption: 'USER_ENTERED',
    });
  }

  const colA = await sheetsValuesGet({
    spreadsheetId: id,
    rangeA1: buildA1Range(tab, 'A:A'),
  });
  let startRow = (colA?.length ?? 0) + 1;
  if (startRow < 2) startRow = 2;

  const createdAt = new Date().toISOString();
  const valueRows: string[][] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = startRow + i;
    const w = rows[i]!;
    valueRows.push([
      w.requestId,
      w.targetType,
      w.market.trim().toUpperCase(),
      w.market === 'KR' ? w.symbol.trim().toUpperCase().padStart(6, '0') : w.symbol.trim().toUpperCase(),
      w.name,
      w.candidateTicker,
      gfFormula(r, 'price'),
      '',
      gfFormula(r, 'currency'),
      '',
      gfFormula(r, 'name'),
      '',
      gfFormula(r, 'tradetime'),
      '',
      gfFormula(r, 'datadelay'),
      '',
      '',
      w.confidence,
      w.message,
      createdAt,
    ]);
  }

  await sheetsValuesUpdate({
    spreadsheetId: id,
    rangeA1: buildA1Range(tab, `A${startRow}:T${startRow + valueRows.length - 1}`),
    values: valueRows,
    valueInputOption: 'USER_ENTERED',
  });
}

export type CandidateReadStatus = 'ok' | 'pending' | 'empty' | 'parse_failed' | 'mismatch';

export function classifyCandidateReadStatus(
  rawPrice: string,
  parsedPrice: number | undefined,
  rawCurrency: string,
): CandidateReadStatus {
  if (parsedPrice != null && parsedPrice > 0 && rawCurrency.trim().length > 0) return 'ok';
  if (!rawPrice) return 'pending';
  const upper = rawPrice.toUpperCase();
  if (upper.includes('LOADING')) return 'pending';
  if (['#N/A', 'N/A'].includes(upper)) return 'mismatch';
  if (upper.startsWith('#')) return 'parse_failed';
  return 'empty';
}

export async function readTickerCandidateSheetRowsForRequest(requestId: string): Promise<CandidateSheetParsedRow[]> {
  const id = spreadsheetId();
  if (!id) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set');
  const tab = candidatesTab();
  let values: unknown[][];
  try {
    values = await sheetsValuesGet({
      spreadsheetId: id,
      rangeA1: buildA1Range(tab, 'A2:T3000'),
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
  } catch {
    values = await sheetsValuesGet({
      spreadsheetId: id,
      rangeA1: buildA1Range(tab, 'A2:T3000'),
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
  }
  const rid = requestId.trim();
  const out: CandidateSheetParsedRow[] = [];
  for (const row of values) {
    if (googleSheetCellAsString(row[0]) !== rid) continue;
    const targetTypeRaw = googleSheetCellAsString(row[1]).toLowerCase();
    const targetType = targetTypeRaw === 'watchlist' ? 'watchlist' : 'holding';
    const market = googleSheetCellAsString(row[2]).toUpperCase();
    const symbol = googleSheetCellAsString(row[3]).toUpperCase();
    const name = googleSheetCellAsString(row[4]) || undefined;
    const candidateTicker = googleSheetCellAsString(row[5]);
    if (!market || !symbol || !candidateTicker) continue;
    const rawPrice = googleSheetCellAsString(row[7]);
    const parsedPrice = parseGoogleFinanceSheetNumber(row[7]);
    const currency = googleSheetCellAsString(row[9]) || undefined;
    const googleName = googleSheetCellAsString(row[11]) || undefined;
    const tradeTime = googleSheetCellAsString(row[13]) || undefined;
    const delayMinutes = parseGoogleFinanceSheetNumber(row[15]);
    const confRaw = googleSheetCellAsString(row[17]).toLowerCase();
    const sheetConfidence =
      confRaw === 'high' || confRaw === 'medium' || confRaw === 'low' ? confRaw : 'low';
    const sheetMessage = googleSheetCellAsString(row[18]) || undefined;
    const createdAt = googleSheetCellAsString(row[19]) || undefined;
    out.push({
      requestId: rid,
      targetType,
      market,
      symbol,
      name,
      candidateTicker,
      rawPrice: rawPrice || undefined,
      parsedPrice,
      currency,
      googleName,
      tradeTime,
      delayMinutes,
      sheetConfidence,
      sheetMessage,
      createdAt,
    });
  }
  return out;
}
