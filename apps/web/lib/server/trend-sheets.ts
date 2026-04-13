import 'server-only';

import { buildTrendReportsLogRow, buildTrendRequestRow } from '@office-unify/ai-office-engine';
import type { TrendAnalysisGenerateRequestBody, TrendAnalysisGenerateResponseBody } from '@office-unify/shared-types';
import { sheetsValuesAppend } from '@/lib/server/google-sheets-api';
import { isSheetsSyncConfigured } from '@/lib/server/google-sheets-portfolio-sync';

const TAB = {
  trendRequests: 'trend_requests',
  trendReportsLog: 'trend_reports_log',
} as const;

function spreadsheetId(): string | null {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || null;
}

export function isTrendSheetsAppendConfigured(): boolean {
  return isSheetsSyncConfigured();
}

/**
 * trend_requests / trend_reports_log 에 각 한 줄 append (read-back 없음).
 * 스프레드시트에 동일 이름 탭과 헤더 행이 있어야 한다.
 */
export async function appendTrendCenterSheets(params: {
  body: TrendAnalysisGenerateRequestBody;
  result: TrendAnalysisGenerateResponseBody;
  reportRef: string;
}): Promise<void> {
  const id = spreadsheetId();
  if (!id) {
    throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set');
  }

  const now = new Date().toISOString();
  const { body, result, reportRef } = params;

  const reqRow = buildTrendRequestRow({
    requestedAt: now,
    body,
    confidence: result.confidence,
    status: 'completed',
    note: reportRef,
  });

  const logRow = buildTrendReportsLogRow({
    generatedAt: now,
    result,
    reportRef,
  });

  await sheetsValuesAppend({
    spreadsheetId: id,
    rangeA1: `${TAB.trendRequests}!A:K`,
    values: [reqRow],
    valueInputOption: 'USER_ENTERED',
  });
  await sheetsValuesAppend({
    spreadsheetId: id,
    rangeA1: `${TAB.trendReportsLog}!A:G`,
    values: [logRow],
    valueInputOption: 'USER_ENTERED',
  });
}
