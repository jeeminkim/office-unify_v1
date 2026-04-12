import 'server-only';

import {
  buildResearchContextCacheRow,
  buildResearchRequestRow,
  buildResearchReportsLogRow,
  extractLogSummaries,
  SHEET_TAB_NAMES,
} from '@office-unify/ai-office-engine';
import type {
  ResearchCenterGenerateRequestBody,
  ResearchCenterGenerateResponseBody,
  ResearchDeskId,
} from '@office-unify/shared-types';
import { sheetsValuesAppend } from '@/lib/server/google-sheets-api';
import { isSheetsSyncConfigured } from '@/lib/server/google-sheets-portfolio-sync';

function spreadsheetId(): string | null {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || null;
}

/**
 * research_requests / research_reports_log / research_context_cache 에 각 한 줄 append.
 * 스프레드시트에 동일 이름 탭과 헤더 행이 있어야 한다.
 */
export async function appendResearchCenterSheets(params: {
  body: ResearchCenterGenerateRequestBody;
  result: ResearchCenterGenerateResponseBody;
  desks: ResearchDeskId[];
}): Promise<void> {
  const id = spreadsheetId();
  if (!id) {
    throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set');
  }

  const now = new Date().toISOString();
  const { body, result, desks } = params;

  const reqRow = buildResearchRequestRow({
    requestedAt: now,
    market: body.market,
    symbol: body.symbol.trim(),
    name: body.name.trim(),
    sector: body.sector?.trim() ?? '',
    selectedDesks: desks,
    toneMode: body.toneMode,
    userHypothesis: body.userHypothesis ?? '',
    knownRisk: body.knownRisk ?? '',
    holdingPeriod: body.holdingPeriod ?? '',
    keyQuestion: body.keyQuestion ?? '',
    includeSheetContext: body.includeSheetContext === true,
    status: 'completed',
    note: result.reportRef,
  });

  const sums = extractLogSummaries({ reports: result.reports, editor: result.editor });
  const logRow = buildResearchReportsLogRow({
    generatedAt: now,
    market: body.market,
    symbol: body.symbol.trim(),
    name: body.name.trim(),
    selectedDesks: desks.join(','),
    strongestLong: sums.strongestLong,
    strongestShort: sums.strongestShort,
    editorVerdict: sums.editorVerdictLine || result.editor.slice(0, 240),
    missingEvidence: sums.missingEvidence,
    nextCheck: sums.nextCheck,
    toneMode: body.toneMode ?? 'standard',
    status: 'completed',
    reportRef: result.reportRef,
  });

  const snap = result.sheetContextSnapshot;
  const cacheRow = buildResearchContextCacheRow({
    market: body.market,
    symbol: body.symbol.trim(),
    name: body.name.trim(),
    isHolding: result.isHolding,
    isWatchlist: result.isWatchlist,
    avgPrice: snap?.avgPrice ?? '',
    targetPrice: snap?.targetPrice ?? '',
    holdingWeightPct: snap?.holdingWeightPct ?? '',
    watchlistPriority: snap?.watchlistPriority ?? '',
    investmentMemo: snap?.investmentMemo ?? '',
    interestReason: snap?.interestReason ?? '',
    observationPoints: snap?.observationPoints ?? '',
    committeeSummaryHint: snap?.committeeSummaryHint ?? '',
    lastSyncedAt: now,
  });

  await sheetsValuesAppend({
    spreadsheetId: id,
    rangeA1: `${SHEET_TAB_NAMES.researchRequests}!A:N`,
    values: [reqRow],
    valueInputOption: 'USER_ENTERED',
  });
  await sheetsValuesAppend({
    spreadsheetId: id,
    rangeA1: `${SHEET_TAB_NAMES.researchReportsLog}!A:L`,
    values: [logRow],
    valueInputOption: 'USER_ENTERED',
  });
  await sheetsValuesAppend({
    spreadsheetId: id,
    rangeA1: `${SHEET_TAB_NAMES.researchContextCache}!A:N`,
    values: [cacheRow],
    valueInputOption: 'USER_ENTERED',
  });
}

export function isResearchSheetsAppendConfigured(): boolean {
  return isSheetsSyncConfigured();
}
