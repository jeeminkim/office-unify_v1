import 'server-only';

import type { GoogleFinanceRepairPostCheck } from '@office-unify/shared-types';
import {
  buildA1Range,
  getSpreadsheetSheets,
  sheetColumnLetter,
  sheetsValuesGet,
  sheetsValuesUpdate,
} from '@/lib/server/google-sheets-api';
import { inspectGoogleSheetsCredentialMeta, type GoogleSheetsCredentialMeta } from '@/lib/server/googleSheetsRepairCredential';
import type { GoogleFinanceQuoteRow } from '@/lib/server/googleFinanceSheetQuoteService';
import { isSimplifiedPortfolioQuotesLayout } from '@/lib/server/googleFinanceSheetQuoteService';
import { missingRequiredAnchors } from '@/lib/server/portfolioQuotesAnchorMatch';
import { runGoogleFinanceSetupCheck } from '@/lib/server/googleFinanceSetupCheck';

export type GoogleSheetsRepairPlanStatus =
  | 'not_needed'
  | 'ready'
  | 'needs_confirmation'
  | 'write_not_available'
  | 'unsafe'
  | 'error';

export type GoogleSheetsRepairOperationType =
  | 'create_sheet'
  | 'write_headers'
  | 'write_sample_formulas'
  | 'append_missing_anchor_rows'
  | 'resize_columns'
  | 'freeze_header'
  | 'no_op';

export type GoogleSheetsRepairRiskLevel = 'low' | 'medium' | 'high';

export type GoogleSheetsRepairOperation = {
  operationId: string;
  type: GoogleSheetsRepairOperationType;
  tabName: string;
  range?: string;
  description: string;
  previewValues?: string[][];
  overwrite: boolean;
  riskLevel: GoogleSheetsRepairRiskLevel;
  blockedReason?: string;
};

export type GoogleSheetsRepairPlan = {
  status: GoogleSheetsRepairPlanStatus;
  writeAvailable: boolean;
  requiresConfirmation: true;
  targetSpreadsheetId?: string;
  credential: GoogleSheetsCredentialMeta;
  operations: GoogleSheetsRepairOperation[];
  warnings: string[];
  actionHint: string;
};

export const PORTFOLIO_QUOTES_REPAIR_HEADERS = [
  'symbol',
  'google_ticker',
  'price',
  'name',
  'volume',
  'marketcap',
  'tradetime',
  'status',
] as const;

export const PORTFOLIO_QUOTES_REPAIR_SAMPLE_ROWS: Array<{ symbol: string; googleTicker: string }> = [
  { symbol: 'SPY', googleTicker: 'NYSEARCA:SPY' },
  { symbol: 'QQQ', googleTicker: 'NASDAQ:QQQ' },
  { symbol: 'DIA', googleTicker: 'NYSEARCA:DIA' },
  { symbol: 'TSLA', googleTicker: 'NASDAQ:TSLA' },
  { symbol: 'NVDA', googleTicker: 'NASDAQ:NVDA' },
  { symbol: 'AAPL', googleTicker: 'NASDAQ:AAPL' },
  { symbol: 'MSFT', googleTicker: 'NASDAQ:MSFT' },
  { symbol: 'NFLX', googleTicker: 'NASDAQ:NFLX' },
  { symbol: '005930', googleTicker: 'KRX:005930' },
  { symbol: '000660', googleTicker: 'KRX:000660' },
];

const REPAIR_EXCLUDED_TAB_PREFIXES = ['research_', 'holdings_dashboard', 'web_ops', 'ops_'] as const;

function portfolioQuotesTabName(): string {
  return process.env.PORTFOLIO_QUOTES_SHEET_NAME?.trim() || 'portfolio_quotes';
}

function spreadsheetId(): string | null {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || null;
}

function cellEmpty(v: unknown): boolean {
  return String(v ?? '').trim().length === 0;
}

function formulaForRow(rowNum: number, field: 'price' | 'name' | 'volume' | 'marketcap' | 'tradetime'): string {
  const b = `B${rowNum}`;
  return `=IFERROR(GOOGLEFINANCE(${b},"${field}"),"")`;
}

function statusFormula(rowNum: number): string {
  return `=IF(C${rowNum}="","missing","ok")`;
}

export function buildPortfolioQuotesRowValues(
  rowNum: number,
  row: { symbol: string; googleTicker: string },
): string[] {
  return [
    row.symbol,
    row.googleTicker,
    formulaForRow(rowNum, 'price'),
    formulaForRow(rowNum, 'name'),
    formulaForRow(rowNum, 'volume'),
    formulaForRow(rowNum, 'marketcap'),
    formulaForRow(rowNum, 'tradetime'),
    statusFormula(rowNum),
  ];
}

export function buildPortfolioQuotesSampleGrid(): string[][] {
  const header = [...PORTFOLIO_QUOTES_REPAIR_HEADERS];
  const body = PORTFOLIO_QUOTES_REPAIR_SAMPLE_ROWS.map((row, idx) => {
    const r = idx + 2;
    return [
      row.symbol,
      row.googleTicker,
      formulaForRow(r, 'price'),
      formulaForRow(r, 'name'),
      formulaForRow(r, 'volume'),
      formulaForRow(r, 'marketcap'),
      formulaForRow(r, 'tradetime'),
      statusFormula(r),
    ];
  });
  return [header, ...body];
}

function isRepairExcludedTab(title: string): boolean {
  const lower = title.toLowerCase();
  return REPAIR_EXCLUDED_TAB_PREFIXES.some((p) => lower.startsWith(p) || lower === p);
}

function headersMatchExpected(row: unknown[] | undefined): boolean {
  if (!row?.length) return false;
  const got = row.map((c) => String(c ?? '').trim().toLowerCase());
  const want = PORTFOLIO_QUOTES_REPAIR_HEADERS.map((h) => h.toLowerCase());
  if (got.length < want.length) return false;
  return want.every((h, i) => got[i] === h);
}

function headersPartiallyPresent(row: unknown[] | undefined): boolean {
  if (!row?.length) return false;
  const got = new Set(row.map((c) => String(c ?? '').trim().toLowerCase()));
  const matched = PORTFOLIO_QUOTES_REPAIR_HEADERS.filter((h) => got.has(h)).length;
  return matched > 0 && matched < PORTFOLIO_QUOTES_REPAIR_HEADERS.length;
}

function sheetHasMeaningfulData(values: unknown[][]): boolean {
  for (const row of values) {
    const sym = String(row[0] ?? '').trim();
    if (sym && sym.toLowerCase() !== 'symbol') return true;
  }
  return false;
}

function buildAppendMissingAnchorOperation(
  tab: string,
  dataRows: unknown[][],
  sheetRows: GoogleFinanceQuoteRow[],
): GoogleSheetsRepairOperation | null {
  const missing = missingRequiredAnchors(sheetRows);
  if (missing.length === 0) return null;
  const nextRow = dataRows.length + 2;
  const preview = missing.map((row, idx) => buildPortfolioQuotesRowValues(nextRow + idx, row));
  const endRow = nextRow + missing.length - 1;
  return {
    operationId: 'append_missing_anchor_rows',
    type: 'append_missing_anchor_rows',
    tabName: tab,
    range: `A${nextRow}:H${endRow}`,
    description: `누락 US anchor ${missing.length}행 append (기존 행 수정 없음)`,
    previewValues: preview,
    overwrite: false,
    riskLevel: 'medium',
  };
}

/** Read-only plan builder — no Sheets write. */
export async function buildGoogleSheetsRepairPlan(
  sheetRows: GoogleFinanceQuoteRow[] = [],
): Promise<GoogleSheetsRepairPlan> {
  const credential = await inspectGoogleSheetsCredentialMeta();
  const id = spreadsheetId();
  const tab = portfolioQuotesTabName();
  const warnings: string[] = [];
  const operations: GoogleSheetsRepairOperation[] = [];
  const previewGrid = buildPortfolioQuotesSampleGrid();

  if (!id || !credential.writeAvailable) {
    return {
      status: 'write_not_available',
      writeAvailable: false,
      requiresConfirmation: true,
      targetSpreadsheetId: id ?? undefined,
      credential,
      operations: [],
      warnings: ['sheets_repair_write_unavailable'],
      actionHint: credential.actionHint,
    };
  }

  let tabExists = false;
  let headerRow: unknown[] = [];
  let dataRows: unknown[][] = [];

  try {
    const tabs = await getSpreadsheetSheets(id);
    tabExists = tabs.some((t) => t.title === tab);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'sheet_metadata_failed';
    warnings.push(msg);
    return {
      status: 'error',
      writeAvailable: true,
      requiresConfirmation: true,
      targetSpreadsheetId: id,
      credential,
      operations: [],
      warnings,
      actionHint: '스프레드시트 메타를 읽지 못했습니다. ID·서비스 계정 Editor 권한을 확인하세요.',
    };
  }

  if (tabExists) {
    try {
      const top = await sheetsValuesGet({
        spreadsheetId: id,
        rangeA1: buildA1Range(tab, 'A1:H30'),
        valueRenderOption: 'FORMULA',
      });
      headerRow = top[0] ?? [];
      dataRows = top.slice(1);
    } catch (e: unknown) {
      warnings.push(e instanceof Error ? e.message : 'sheet_values_read_failed');
    }
  }

  const hasData = sheetHasMeaningfulData(dataRows);
  const headersOk = headersMatchExpected(headerRow);
  const headersPartial = headersPartiallyPresent(headerRow);

  const simplifiedCompatible =
    headersOk || isSimplifiedPortfolioQuotesLayout(headerRow) || (hasData && !headersPartial);

  if (headersPartial && hasData) {
    warnings.push('repair_unsafe_partial_headers');
    operations.push({
      operationId: 'write_headers_blocked',
      type: 'no_op',
      tabName: tab,
      description: '헤더가 일부만 있어 전체 rewrite는 차단됩니다.',
      overwrite: false,
      riskLevel: 'high',
      blockedReason: 'partial_headers_with_data',
    });
  }

  if (headersPartial && hasData && operations.every((o) => o.type === 'no_op' || o.type === 'append_missing_anchor_rows')) {
    const hasAppend = operations.some((o) => o.type === 'append_missing_anchor_rows');
    if (hasAppend) {
      return {
        status: 'needs_confirmation',
        writeAvailable: true,
        requiresConfirmation: true,
        targetSpreadsheetId: id,
        credential,
        operations: operations.filter((o) => o.type !== 'no_op'),
        warnings,
        actionHint:
          '기존 데이터는 덮어쓰지 않습니다. 누락 anchor 행만 append하는 보강을 사용하세요.',
      };
    }
    return {
      status: 'unsafe',
      writeAvailable: true,
      requiresConfirmation: true,
      targetSpreadsheetId: id,
      credential,
      operations,
      warnings,
      actionHint:
        '기존 헤더/데이터가 일부 있습니다. 덮어쓰지 않으며 전체 헤더 rewrite는 하지 않습니다. 수동 복사 또는 빈 탭을 권장합니다.',
    };
  }

  if (!tabExists) {
    operations.push({
      operationId: 'create_portfolio_quotes',
      type: 'create_sheet',
      tabName: tab,
      description: `${tab} 탭 생성`,
      previewValues: [[`(new tab) ${tab}`]],
      overwrite: false,
      riskLevel: 'low',
    });
  }

  if (!headersOk) {
    operations.push({
      operationId: 'write_portfolio_quotes_headers',
      type: 'write_headers',
      tabName: tab,
      range: `A1:${sheetColumnLetter(PORTFOLIO_QUOTES_REPAIR_HEADERS.length)}1`,
      description: '헤더 행 작성 (symbol, google_ticker, price, …)',
      previewValues: [previewGrid[0]!],
      overwrite: false,
      riskLevel: 'low',
      blockedReason: hasData && headersOk === false && headerRow.some((c) => !cellEmpty(c))
        ? 'header_row_has_values'
        : undefined,
    });
  }

  const sampleStartRow = 2;
  const sampleEndRow = sampleStartRow + PORTFOLIO_QUOTES_REPAIR_SAMPLE_ROWS.length - 1;
  const needsSample =
    !tabExists || !hasData || dataRows.every((r) => cellEmpty(r[0]));

  if (needsSample) {
    operations.push({
      operationId: 'write_portfolio_quotes_sample',
      type: 'write_sample_formulas',
      tabName: tab,
      range: `A${sampleStartRow}:${sheetColumnLetter(PORTFOLIO_QUOTES_REPAIR_HEADERS.length)}${sampleEndRow}`,
      description: '샘플 종목·GOOGLEFINANCE 수식 작성 (빈 셀만, overwrite=false)',
      previewValues: previewGrid.slice(1),
      overwrite: false,
      riskLevel: 'low',
    });
  }

  if (
    tabExists &&
    simplifiedCompatible &&
    hasData &&
    !operations.some((o) => o.operationId === 'append_missing_anchor_rows')
  ) {
    const appendOp = buildAppendMissingAnchorOperation(tab, dataRows, sheetRows);
    if (appendOp) operations.push(appendOp);
  }

  if (operations.length === 0 || operations.every((o) => o.type === 'no_op')) {
    operations.push({
      operationId: 'noop_ok',
      type: 'no_op',
      tabName: tab,
      description: 'portfolio_quotes 탭·헤더·샘플이 이미 충분합니다.',
      overwrite: false,
      riskLevel: 'low',
    });
    return {
      status: 'not_needed',
      writeAvailable: true,
      requiresConfirmation: true,
      targetSpreadsheetId: id,
      credential,
      operations,
      warnings,
      actionHint: '추가 Repair가 필요하지 않습니다. 시세 새로고침·Today Brief를 실행하세요.',
    };
  }

  const lowRiskIds = new Set(
    operations.filter((o) => o.riskLevel === 'low' && !o.blockedReason).map((o) => o.operationId),
  );
  if (lowRiskIds.size > 0) {
    operations.push({
      operationId: 'freeze_portfolio_quotes_header',
      type: 'freeze_header',
      tabName: tab,
      description: '1행 헤더 고정',
      overwrite: false,
      riskLevel: 'low',
    });
    operations.push({
      operationId: 'resize_portfolio_quotes_columns',
      type: 'resize_columns',
      tabName: tab,
      description: '열 너비 자동 조정(대략적)',
      overwrite: false,
      riskLevel: 'low',
    });
  }

  return {
    status: 'needs_confirmation',
    writeAvailable: true,
    requiresConfirmation: true,
    targetSpreadsheetId: id,
    credential,
    operations,
    warnings,
    actionHint:
      '「수정 미리보기」를 확인한 뒤 「적용」을 누르면 표시된 operation만 1회 Sheets에 write합니다. 기존 값이 있는 셀은 덮어쓰지 않습니다.',
  };
}

type ApplyRequest = {
  confirm: boolean;
  operationIds?: string[];
  overwrite?: boolean;
  idempotencyKey?: string;
};

export type GoogleSheetsRepairApplyResult = {
  ok: boolean;
  status:
    | 'applied'
    | 'partial'
    | 'already_applied'
    | 'write_not_available'
    | 'confirmation_required'
    | 'error';
  appliedOperations: string[];
  /** additive: append_missing_anchor_rows로 추가된 symbol */
  appendedAnchorSymbols?: string[];
  skippedOperations: Array<{ operationId: string; reason: string }>;
  postCheck?: GoogleFinanceRepairPostCheck;
  qualityMeta: {
    writeAction: true;
    confirmed: boolean;
    idempotent: boolean;
  };
};

function buildRepairPostCheck(
  post: Awaited<ReturnType<typeof runGoogleFinanceSetupCheck>>,
): GoogleFinanceRepairPostCheck {
  const s = post.usAnchor.summary;
  return {
    sheetsOkCount: s.sheetsAnchorOk,
    missingCount: s.missing,
    actionHint: post.anchorRecovery.nextStep,
    parsedRowsOk: s.parsedRowsOk,
    anchorMatched: s.sheetsAnchorMatched,
    anchorOk: s.sheetsAnchorOk,
    missingAnchors: s.missingAnchorSymbols,
    recommendedNextAction: post.anchorRecovery.nextStep,
  };
}

const applyIdempotencyCache = new Map<string, { appliedAt: string; operationIds: string[] }>();

function ymdSeoul(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
}

async function createSheetTab(spreadsheetId: string, title: string): Promise<void> {
  const { getSheetsAccessToken } = await import('@/lib/server/google-sheets-api');
  const token = await getSheetsAccessToken();
  if (!token) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`addSheet failed: ${res.status} ${t.slice(0, 200)}`);
  }
}

async function freezeHeaderRow(spreadsheetId: string, tab: string, sheetId: number): Promise<void> {
  const { getSheetsAccessToken } = await import('@/lib/server/google-sheets-api');
  const token = await getSheetsAccessToken();
  if (!token) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`freeze failed: ${res.status} ${t.slice(0, 200)}`);
  }
}

async function mergeEmptyCellsOnly(
  spreadsheetId: string,
  tab: string,
  startRow: number,
  grid: string[][],
  overwrite: boolean,
): Promise<string[][]> {
  if (overwrite) return grid;
  const endRow = startRow + grid.length - 1;
  const col = sheetColumnLetter(PORTFOLIO_QUOTES_REPAIR_HEADERS.length);
  let existing: unknown[][] = [];
  try {
    existing = await sheetsValuesGet({
      spreadsheetId,
      rangeA1: buildA1Range(tab, `A${startRow}:${col}${endRow}`),
      valueRenderOption: 'FORMULA',
    });
  } catch {
    return grid;
  }
  return grid.map((row, ri) =>
    row.map((cell, ci) => {
      const cur = existing[ri]?.[ci];
      return cellEmpty(cur) ? cell : String(cur ?? '');
    }),
  );
}

export async function applyGoogleSheetsRepair(req: ApplyRequest): Promise<GoogleSheetsRepairApplyResult> {
  if (req.confirm !== true) {
    return {
      ok: false,
      status: 'confirmation_required',
      appliedOperations: [],
      skippedOperations: [],
      qualityMeta: { writeAction: true, confirmed: false, idempotent: false },
    };
  }

  const credential = await inspectGoogleSheetsCredentialMeta();
  const id = spreadsheetId();
  if (!id || !credential.writeAvailable) {
    return {
      ok: false,
      status: 'write_not_available',
      appliedOperations: [],
      skippedOperations: [{ operationId: '*', reason: 'write_not_available' }],
      qualityMeta: { writeAction: true, confirmed: true, idempotent: false },
    };
  }

  let sheetRows: GoogleFinanceQuoteRow[] = [];
  try {
    const { readGoogleFinanceQuoteSheetRows } = await import('@/lib/server/googleFinanceSheetQuoteService');
    sheetRows = (await readGoogleFinanceQuoteSheetRows()).rows;
  } catch {
    sheetRows = [];
  }

  const plan = await buildGoogleSheetsRepairPlan(sheetRows);
  const hasAppendOp = plan.operations.some((o) => o.type === 'append_missing_anchor_rows');
  if (plan.status === 'error' || (plan.status === 'unsafe' && !hasAppendOp)) {
    return {
      ok: false,
      status: 'error',
      appliedOperations: [],
      skippedOperations: plan.operations.map((o) => ({
        operationId: o.operationId,
        reason: o.blockedReason ?? plan.status,
      })),
      qualityMeta: { writeAction: true, confirmed: true, idempotent: false },
    };
  }

  const overwrite = req.overwrite === true;
  const requested = new Set(req.operationIds ?? []);
  const filterOps = (op: GoogleSheetsRepairOperation) => {
    if (op.type === 'no_op') return false;
    if (op.blockedReason) return false;
    if (requested.size === 0) {
      return op.riskLevel === 'low' || op.type === 'append_missing_anchor_rows';
    }
    return requested.has(op.operationId);
  };

  const ops = plan.operations.filter(filterOps);
  const cacheKey = `${id}:${req.idempotencyKey ?? ymdSeoul()}:${ops.map((o) => o.operationId).sort().join(',')}`;
  const cached = applyIdempotencyCache.get(cacheKey);
  if (cached) {
    const post = await runGoogleFinanceSetupCheck();
    return {
      ok: true,
      status: 'already_applied',
      appliedOperations: cached.operationIds,
      skippedOperations: [],
      postCheck: buildRepairPostCheck(post),
      qualityMeta: { writeAction: true, confirmed: true, idempotent: true },
    };
  }

  const applied: string[] = [];
  const appendedAnchorSymbols: string[] = [];
  const skipped: Array<{ operationId: string; reason: string }> = [];
  const tab = portfolioQuotesTabName();
  const previewGrid = buildPortfolioQuotesSampleGrid();
  let sheetIdForTab: number | undefined;

  try {
    const tabs = await getSpreadsheetSheets(id);
    sheetIdForTab = tabs.find((t) => t.title === tab)?.sheetId;
  } catch {
    /* optional for freeze */
  }

  for (const op of ops) {
    try {
      if (op.type === 'create_sheet') {
        const tabs = await getSpreadsheetSheets(id);
        if (!tabs.some((t) => t.title === tab)) {
          await createSheetTab(id, tab);
        }
        applied.push(op.operationId);
        continue;
      }

      if (op.type === 'write_headers') {
        const existing = await sheetsValuesGet({
          spreadsheetId: id,
          rangeA1: buildA1Range(tab, 'A1:H1'),
        }).catch(() => []);
        const row = existing[0] ?? [];
        if (!overwrite && row.some((c) => !cellEmpty(c))) {
          skipped.push({ operationId: op.operationId, reason: 'header_not_empty' });
          continue;
        }
        await sheetsValuesUpdate({
          spreadsheetId: id,
          rangeA1: buildA1Range(tab, `A1:${sheetColumnLetter(PORTFOLIO_QUOTES_REPAIR_HEADERS.length)}1`),
          values: [previewGrid[0]!],
          valueInputOption: 'USER_ENTERED',
        });
        applied.push(op.operationId);
        continue;
      }

      if (op.type === 'write_sample_formulas') {
        const body = previewGrid.slice(1);
        const merged = await mergeEmptyCellsOnly(id, tab, 2, body, overwrite);
        const allEmpty = merged.every((row) => row.every((c) => cellEmpty(c)));
        if (allEmpty && !overwrite) {
          skipped.push({ operationId: op.operationId, reason: 'all_cells_occupied' });
          continue;
        }
        const endRow = 1 + merged.length;
        await sheetsValuesUpdate({
          spreadsheetId: id,
          rangeA1: buildA1Range(
            tab,
            `A2:${sheetColumnLetter(PORTFOLIO_QUOTES_REPAIR_HEADERS.length)}${endRow}`,
          ),
          values: merged,
          valueInputOption: 'USER_ENTERED',
        });
        applied.push(op.operationId);
        continue;
      }

      if (op.type === 'append_missing_anchor_rows') {
        const body = op.previewValues ?? [];
        if (body.length === 0) {
          skipped.push({ operationId: op.operationId, reason: 'no_missing_anchors' });
          continue;
        }
        const range = op.range ?? `A2:H${1 + body.length}`;
        await sheetsValuesUpdate({
          spreadsheetId: id,
          rangeA1: buildA1Range(tab, range),
          values: body,
          valueInputOption: 'USER_ENTERED',
        });
        for (const row of body) {
          const sym = String(row[0] ?? '').trim().toUpperCase();
          if (sym) appendedAnchorSymbols.push(sym);
        }
        applied.push(op.operationId);
        continue;
      }

      if (op.type === 'freeze_header') {
        if (sheetIdForTab == null) {
          const tabs = await getSpreadsheetSheets(id);
          sheetIdForTab = tabs.find((t) => t.title === tab)?.sheetId;
        }
        if (sheetIdForTab != null) {
          await freezeHeaderRow(id, tab, sheetIdForTab);
          applied.push(op.operationId);
        } else {
          skipped.push({ operationId: op.operationId, reason: 'sheet_id_unknown' });
        }
        continue;
      }

      if (op.type === 'resize_columns') {
        if (sheetIdForTab == null) {
          const tabs = await getSpreadsheetSheets(id);
          sheetIdForTab = tabs.find((t) => t.title === tab)?.sheetId;
        }
        if (sheetIdForTab != null) {
          const { getSheetsAccessToken } = await import('@/lib/server/google-sheets-api');
          const token = await getSheetsAccessToken();
          if (token) {
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`;
            await fetch(url, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requests: [
                  {
                    autoResizeDimensions: {
                      dimensions: {
                        sheetId: sheetIdForTab,
                        dimension: 'COLUMNS',
                        startIndex: 0,
                        endIndex: PORTFOLIO_QUOTES_REPAIR_HEADERS.length,
                      },
                    },
                  },
                ],
              }),
            });
          }
        }
        applied.push(op.operationId);
        continue;
      }
    } catch (e: unknown) {
      skipped.push({
        operationId: op.operationId,
        reason: e instanceof Error ? e.message.slice(0, 120) : 'apply_failed',
      });
    }
  }

  if (applied.length > 0) {
    applyIdempotencyCache.set(cacheKey, { appliedAt: new Date().toISOString(), operationIds: applied });
  }

  const post = await runGoogleFinanceSetupCheck();
  const status =
    applied.length > 0 && skipped.length === 0
      ? 'applied'
      : applied.length > 0
        ? 'partial'
        : 'error';

  const postCheck = buildRepairPostCheck(post);
  postCheck.actionHint = `${postCheck.recommendedNextAction} GOOGLEFINANCE 계산에 1분 정도 걸릴 수 있습니다.`.trim();

  return {
    ok: applied.length > 0,
    status,
    appliedOperations: applied,
    appendedAnchorSymbols: appendedAnchorSymbols.length > 0 ? appendedAnchorSymbols : undefined,
    skippedOperations: skipped,
    postCheck,
    qualityMeta: { writeAction: true, confirmed: true, idempotent: false },
  };
}

export function isRepairExcludedTabName(title: string): boolean {
  return isRepairExcludedTab(title);
}
