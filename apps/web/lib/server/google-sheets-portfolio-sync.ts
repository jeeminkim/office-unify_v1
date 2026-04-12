import type { WebPortfolioHoldingRow, WebPortfolioWatchlistRow } from '@office-unify/supabase-access';
import {
  SHEET_TAB_NAMES,
  committeeInputSummarySheetGrid,
  holdingsDashboardSheetGrid,
  ledgerQueueRowToValues,
  portfolioSummarySheetGrid,
  watchlistDashboardSheetGrid,
  type LedgerChangeQueueColumnKey,
} from '@office-unify/ai-office-engine';
import { sheetsValuesAppend, sheetsValuesUpdate } from '@/lib/server/google-sheets-api';

function spreadsheetId(): string | null {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || null;
}

/**
 * Supabase 원장 → 4개 탭 덮어쓰기 (holdings / watchlist / portfolio_summary / committee_input_summary).
 * ledger_change_queue는 건드리지 않는다.
 */
export async function syncPortfolioDashboardSheets(params: {
  holdings: WebPortfolioHoldingRow[];
  watchlist: WebPortfolioWatchlistRow[];
}): Promise<void> {
  const id = spreadsheetId();
  if (!id) {
    throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set');
  }

  const h = holdingsDashboardSheetGrid(params.holdings);
  const w = watchlistDashboardSheetGrid(params.watchlist);
  const p = portfolioSummarySheetGrid(params.holdings);
  const c = committeeInputSummarySheetGrid(params.holdings);

  await sheetsValuesUpdate({
    spreadsheetId: id,
    rangeA1: `${SHEET_TAB_NAMES.holdings}!A1`,
    values: h,
    valueInputOption: 'USER_ENTERED',
  });
  await sheetsValuesUpdate({
    spreadsheetId: id,
    rangeA1: `${SHEET_TAB_NAMES.watchlist}!A1`,
    values: w,
    valueInputOption: 'USER_ENTERED',
  });
  await sheetsValuesUpdate({
    spreadsheetId: id,
    rangeA1: `${SHEET_TAB_NAMES.portfolioSummary}!A1`,
    values: p,
    valueInputOption: 'USER_ENTERED',
  });
  await sheetsValuesUpdate({
    spreadsheetId: id,
    rangeA1: `${SHEET_TAB_NAMES.committeeSummary}!A1`,
    values: c,
    valueInputOption: 'USER_ENTERED',
  });
}

/** ledger_change_queue 탭에 한 줄 추가 (DB 직접 반영 없음). */
export async function appendLedgerChangeQueueRow(
  row: Partial<Record<LedgerChangeQueueColumnKey, string>>,
): Promise<void> {
  const id = spreadsheetId();
  if (!id) {
    throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set');
  }
  const values = [ledgerQueueRowToValues(row)];
  await sheetsValuesAppend({
    spreadsheetId: id,
    rangeA1: `${SHEET_TAB_NAMES.ledgerQueue}!A:S`,
    values,
  });
}

export function isSheetsSyncConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() && spreadsheetId());
}
