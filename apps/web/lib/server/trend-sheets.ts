import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfficeUserKey } from '@office-unify/shared-types';
import {
  buildTrendReportsLogRow,
  buildTrendRequestRow,
  logTrendOpsEvent,
  TREND_REPORTS_LOG_HEADER,
  TREND_REQUESTS_HEADER,
  TREND_WARNING_CODES,
} from '@office-unify/ai-office-engine';
import type { TrendAnalysisGenerateRequestBody, TrendAnalysisGenerateResponseBody } from '@office-unify/shared-types';
import { buildA1Range, ensureSheetTab, sheetsValuesAppend, sheetColumnLetter } from '@/lib/server/google-sheets-api';
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

async function tryAppend(
  spreadsheetId: string,
  rangeCandidates: string[],
  values: string[][],
): Promise<{ ok: boolean; rangeUsed?: string; error?: string; fallbackUsed?: boolean }> {
  let lastErr = '';
  for (let i = 0; i < rangeCandidates.length; i++) {
    const rangeA1 = rangeCandidates[i]!;
    try {
      await sheetsValuesAppend({
        spreadsheetId,
        rangeA1,
        values,
        valueInputOption: 'USER_ENTERED',
      });
      return { ok: true, rangeUsed: rangeA1, fallbackUsed: i > 0 };
    } catch (e: unknown) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  return { ok: false, error: lastErr };
}

export type TrendSheetsAppendOutcome = {
  requestLogAppendOk: boolean;
  requestLogAppendSkipped?: boolean;
  requestLogAppendWarning?: string;
  trendReportsLogOk?: boolean;
  trendReportsLogWarning?: string;
};

/**
 * trend_requests / trend_reports_log 에 각 한 줄 append (read-back 없음).
 * 탭·헤더 자동 생성 시도, range는 작은따옴표 보호 A1 표기.
 */
export async function appendTrendCenterSheets(params: {
  body: TrendAnalysisGenerateRequestBody;
  result: TrendAnalysisGenerateResponseBody;
  reportRef: string;
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
  topicKey: string;
}): Promise<TrendSheetsAppendOutcome> {
  const id = spreadsheetId();
  if (!id) {
    throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set');
  }

  const { body, result, reportRef, supabase, userKey, topicKey } = params;

  const now = new Date().toISOString();

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

  const reqCols = reqRow.length;
  const logCols = logRow.length;
  const reqLast = sheetColumnLetter(reqCols);
  const logLast = sheetColumnLetter(logCols);

  let tabCreated = false;
  try {
    const reqTab = await ensureSheetTab({
      spreadsheetId: id,
      title: TAB.trendRequests,
      header: [...TREND_REQUESTS_HEADER],
    });
    if (reqTab.created) tabCreated = true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    void logTrendOpsEvent({
      supabase,
      userKey,
      topicKey,
      severity: 'warning',
      code: TREND_WARNING_CODES.SHEETS_TREND_REQUESTS_APPEND_FAILED,
      stage: 'ui_response',
      message: 'trend_requests tab ensure failed',
      detail: { error: { message: msg.slice(0, 400) } },
      fingerprintParts: ['trend', String(userKey), topicKey, 'sheets', 'trend_requests_tab'],
    });
    return {
      requestLogAppendOk: false,
      requestLogAppendWarning: msg.slice(0, 300),
      trendReportsLogOk: false,
      trendReportsLogWarning: msg.slice(0, 300),
    };
  }

  if (tabCreated) {
    void logTrendOpsEvent({
      supabase,
      userKey,
      topicKey,
      severity: 'info',
      code: TREND_WARNING_CODES.SHEETS_TREND_REQUESTS_TAB_CREATED,
      stage: 'ui_response',
      message: 'trend_requests sheet tab created',
      fingerprintParts: ['trend', String(userKey), topicKey, 'sheets', 'tab_created'],
    });
  }

  const reqRanges = [
    buildA1Range(TAB.trendRequests, `A:${reqLast}`),
    buildA1Range(TAB.trendRequests, 'A:K'),
    buildA1Range(TAB.trendRequests, 'A1'),
  ];

  const reqAttempt = await tryAppend(id, reqRanges, [reqRow]);
  if (!reqAttempt.ok) {
    const msg = reqAttempt.error ?? '';
    const invalidRange = msg.toLowerCase().includes('unable to parse range');
    void logTrendOpsEvent({
      supabase,
      userKey,
      topicKey,
      severity: 'warning',
      code: invalidRange
        ? TREND_WARNING_CODES.SHEETS_TREND_REQUESTS_RANGE_INVALID
        : TREND_WARNING_CODES.SHEETS_TREND_REQUESTS_APPEND_FAILED,
      stage: 'ui_response',
      message: invalidRange ? 'trend_requests append range invalid' : 'trend_requests append failed',
      detail: { error: { message: msg.slice(0, 400) } },
      fingerprintParts: ['trend', String(userKey), topicKey, 'sheets', 'trend_requests_range_invalid'],
    });
  } else if (reqAttempt.fallbackUsed) {
    void logTrendOpsEvent({
      supabase,
      userKey,
      topicKey,
      severity: 'info',
      code: TREND_WARNING_CODES.SHEETS_TREND_REQUESTS_APPEND_FALLBACK_USED,
      stage: 'ui_response',
      message: 'trend_requests append used alternate range',
      detail: { rangeUsed: reqAttempt.rangeUsed },
      fingerprintParts: ['trend', String(userKey), topicKey, 'sheets', 'append_fallback_used'],
    });
  }

  let logOk = false;
  let logWarn: string | undefined;
  try {
    await ensureSheetTab({
      spreadsheetId: id,
      title: TAB.trendReportsLog,
      header: [...TREND_REPORTS_LOG_HEADER],
    });
    const logRanges = [
      buildA1Range(TAB.trendReportsLog, `A:${logLast}`),
      buildA1Range(TAB.trendReportsLog, 'A:G'),
      buildA1Range(TAB.trendReportsLog, 'A1'),
    ];
    const logAttempt = await tryAppend(id, logRanges, [logRow]);
    logOk = logAttempt.ok;
    if (!logAttempt.ok) logWarn = logAttempt.error?.slice(0, 300);
  } catch (e: unknown) {
    logWarn = e instanceof Error ? e.message : String(e);
  }

  return {
    requestLogAppendOk: reqAttempt.ok,
    requestLogAppendWarning: reqAttempt.ok ? undefined : reqAttempt.error?.slice(0, 300),
    trendReportsLogOk: logOk,
    trendReportsLogWarning: logWarn,
  };
}
