import "server-only";

import type {
  OfficeUserKey,
  QuoteRecoveryRunbookExecuteRequest,
  QuoteRecoveryRunbookResponse,
  QuoteRecoveryRunbookStep,
} from "@office-unify/shared-types";
import { listWebPortfolioHoldingsForUser } from "@office-unify/supabase-access";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isGoogleFinanceQuoteConfigured,
  readGoogleFinanceQuoteSheetRows,
  syncGoogleFinanceQuoteSheetRows,
} from "@/lib/server/googleFinanceSheetQuoteService";
import {
  buildPortfolioQuoteReadbackDiagnostics,
  refreshLifecycleFromDiagnostics,
} from "@/lib/server/quotePipelineDiagnostics";
import { runGoogleFinanceSetupCheck } from "@/lib/server/googleFinanceSetupCheck";

type Runtime = {
  configured: boolean;
  totalHoldings: number;
  rowsWithPrice: number;
  missingQuoteCount: number;
  formulaPendingCount: number;
  invalidTickerCount: number;
  missingGoogleTickerCount: number;
  quoteUsabilityStatus: "ok" | "partial" | "failed" | "formula_pending" | "mapping_required" | "cache_stale";
  failedSymbols: string[];
  usAnchorOk: number;
  usFeedIssue: boolean;
  readFailed?: boolean;
};

const runbookId = "quote_recovery";

function step(input: QuoteRecoveryRunbookStep): QuoteRecoveryRunbookStep {
  return input;
}

async function collectQuoteRuntime(supabase: SupabaseClient, userKey: string): Promise<Runtime> {
  const holdings = await listWebPortfolioHoldingsForUser(supabase, userKey as OfficeUserKey).catch(() => []);
  const configured = isGoogleFinanceQuoteConfigured();
  if (!configured) {
    return {
      configured: false,
      totalHoldings: holdings.length,
      rowsWithPrice: 0,
      missingQuoteCount: holdings.length,
      formulaPendingCount: 0,
      invalidTickerCount: 0,
      missingGoogleTickerCount: holdings.filter((h) => !h.google_ticker?.trim()).length,
      quoteUsabilityStatus: "failed",
      failedSymbols: holdings.map((h) => `${h.market}:${h.symbol}`),
      usAnchorOk: 0,
      usFeedIssue: true,
    };
  }

  try {
    const [readback, setup] = await Promise.all([readGoogleFinanceQuoteSheetRows(), runGoogleFinanceSetupCheck()]);
    const diagnostics = buildPortfolioQuoteReadbackDiagnostics({ holdings, rows: readback.rows });
    return {
      configured: true,
      totalHoldings: holdings.length,
      rowsWithPrice: diagnostics.rowsWithPrice,
      missingQuoteCount: diagnostics.failedSymbols.length,
      formulaPendingCount: diagnostics.rowsFormulaPending,
      invalidTickerCount: diagnostics.rowsInvalidTicker,
      missingGoogleTickerCount: diagnostics.rowsMissingGoogleTicker,
      quoteUsabilityStatus: diagnostics.quoteUsabilityStatus,
      failedSymbols: diagnostics.failedSymbols,
      usAnchorOk: setup.usAnchor.ok,
      usFeedIssue: setup.usAnchor.ok === 0,
    };
  } catch {
    return {
      configured: true,
      totalHoldings: holdings.length,
      rowsWithPrice: 0,
      missingQuoteCount: holdings.length,
      formulaPendingCount: 0,
      invalidTickerCount: 0,
      missingGoogleTickerCount: holdings.filter((h) => !h.google_ticker?.trim()).length,
      quoteUsabilityStatus: "failed",
      failedSymbols: holdings.map((h) => `${h.market}:${h.symbol}`),
      usAnchorOk: 0,
      usFeedIssue: true,
      readFailed: true,
    };
  }
}

function buildPlan(runtime: Runtime, results: Partial<Record<QuoteRecoveryRunbookStep["key"], QuoteRecoveryRunbookStep>> = {}): QuoteRecoveryRunbookResponse {
  const missingQuotes = runtime.missingQuoteCount > 0 || runtime.quoteUsabilityStatus !== "ok";
  const needsTickerResolve = runtime.invalidTickerCount > 0 || runtime.missingGoogleTickerCount > 0 || runtime.quoteUsabilityStatus === "mapping_required";
  const formulaPending = runtime.formulaPendingCount > 0 || runtime.quoteUsabilityStatus === "formula_pending";
  const refreshCanRun = runtime.configured && missingQuotes && runtime.rowsWithPrice < runtime.totalHoldings;

  const steps: QuoteRecoveryRunbookStep[] = [
    step({
      key: "check_quote_status",
      labelKo: "시세 상태 확인",
      descriptionKo: "현재 보유 종목의 quote read-back, missing, formula pending, ticker mapping 상태를 읽습니다.",
      actionType: "read_only",
      status: runtime.quoteUsabilityStatus === "ok" ? "passed" : runtime.readFailed ? "failed" : "warning",
      canRunAfterUserClick: true,
      requiresConfirm: false,
      resultSummaryKo: `usable ${runtime.rowsWithPrice}/${runtime.totalHoldings}, missing ${runtime.missingQuoteCount}`,
    }),
    step({
      key: "refresh_missing_quotes",
      labelKo: "없는 시세만 refresh 요청",
      descriptionKo: "이미 read-back 값이 있는 종목은 자동 갱신하지 않고, 누락/부분 상태일 때만 명시 클릭 후 refresh를 요청합니다.",
      actionType: "explicit_post",
      status: refreshCanRun ? "pending" : "skipped",
      canRunAfterUserClick: refreshCanRun,
      requiresConfirm: true,
      resultSummaryKo: refreshCanRun ? "missing quote가 있어 refresh 가능" : "현재 상태에서는 자동 refresh 생략",
    }),
    step({
      key: "wait_formula_readback",
      labelKo: "formula read-back 대기",
      descriptionKo: "Google Finance 수식이 pending이면 성공 처리하지 않고 재확인 안내를 남깁니다.",
      actionType: "wait",
      status: formulaPending ? "warning" : "skipped",
      canRunAfterUserClick: false,
      requiresConfirm: false,
    }),
    step({
      key: "recheck_quote_status",
      labelKo: "시세 상태 재확인",
      descriptionKo: "refresh 후 quote status를 다시 읽어 still missing, pending, success를 분리합니다.",
      actionType: "read_only",
      status: "pending",
      canRunAfterUserClick: true,
      requiresConfirm: false,
    }),
    step({
      key: "resolve_missing_tickers",
      labelKo: "ticker mapping 누락 점검",
      descriptionKo: "google_ticker, quote_symbol, invalid symbol 문제를 smart resolve 후보로 계산합니다. 저장은 하지 않습니다.",
      actionType: "read_only",
      status: needsTickerResolve ? "warning" : "skipped",
      canRunAfterUserClick: true,
      requiresConfirm: false,
      resultSummaryKo: needsTickerResolve ? `mapping 확인 필요 ${runtime.invalidTickerCount + runtime.missingGoogleTickerCount}건` : undefined,
    }),
    step({
      key: "check_us_feed",
      labelKo: "US feed 진단",
      descriptionKo: "미국 anchor/feed 상태를 Google Finance repair 문제와 분리해서 표시합니다.",
      actionType: "read_only",
      status: runtime.usFeedIssue ? "warning" : "passed",
      canRunAfterUserClick: true,
      requiresConfirm: false,
    }),
    step({
      key: "check_us_theme_mapping",
      labelKo: "US theme mapping 진단",
      descriptionKo: "미국 신호가 watchlist/sector/theme로 연결되는지 확인합니다.",
      actionType: "navigate",
      status: runtime.usFeedIssue ? "warning" : "pending",
      canRunAfterUserClick: false,
      requiresConfirm: false,
    }),
    step({
      key: "run_discovery_universe",
      labelKo: "Discovery Universe 진단",
      descriptionKo: "후보를 강제로 만들지 않고 관찰 후보 universe 입력 상태만 점검합니다.",
      actionType: "read_only",
      status: "pending",
      canRunAfterUserClick: true,
      requiresConfirm: false,
    }),
    step({
      key: "rerun_today_brief",
      labelKo: "Today Brief 재확인",
      descriptionKo: "quote/ticker/mapping 결과를 반영해 Today Brief를 다시 확인합니다.",
      actionType: "read_only",
      status: "pending",
      canRunAfterUserClick: true,
      requiresConfirm: false,
    }),
    step({
      key: "open_google_finance_settings",
      labelKo: "Google Finance 설정 열기",
      descriptionKo: "anchor/formula 설정 자체가 문제일 때만 마지막 수단으로 설정 화면을 엽니다.",
      actionType: "navigate",
      status: runtime.configured ? "skipped" : "warning",
      canRunAfterUserClick: false,
      requiresConfirm: false,
    }),
  ].map((s) => results[s.key] ?? s);

  const blocked = !runtime.configured || runtime.readFailed;
  const partial = steps.some((s) => s.status === "warning" || s.status === "failed");
  const nextPrimaryAction: QuoteRecoveryRunbookResponse["nextPrimaryAction"] =
    formulaPending
      ? "wait_and_recheck"
      : needsTickerResolve
        ? "open_ticker_resolve"
        : runtime.usFeedIssue
          ? "open_theme_mapping"
          : missingQuotes
            ? "run_recovery"
            : "none";

  return {
    ok: !blocked,
    runbookId,
    status: blocked ? "blocked" : partial ? "partial" : "ready",
    title: "One-Click Quote Recovery",
    summaryKo:
      "이 작업은 시세 상태, ticker mapping, 미국 feed, 후보 universe를 순서대로 점검합니다. 매수 추천이나 자동주문은 실행하지 않습니다.",
    steps,
    nextPrimaryAction,
    writeAction: false,
    autoTrading: false,
    autoOrder: false,
  };
}

export async function buildQuoteRecoveryRunbookPlan(
  supabase: SupabaseClient,
  userKey: string,
): Promise<QuoteRecoveryRunbookResponse> {
  return buildPlan(await collectQuoteRuntime(supabase, userKey));
}

export async function executeQuoteRecoveryRunbook(input: {
  supabase: SupabaseClient;
  userKey: string;
  request: QuoteRecoveryRunbookExecuteRequest;
}): Promise<QuoteRecoveryRunbookResponse> {
  const runtime = await collectQuoteRuntime(input.supabase, input.userKey);
  const results: Partial<Record<QuoteRecoveryRunbookStep["key"], QuoteRecoveryRunbookStep>> = {};
  const base = buildPlan(runtime);
  const refreshStep = base.steps.find((s) => s.key === "refresh_missing_quotes");

  if (refreshStep?.canRunAfterUserClick && runtime.configured) {
    const holdings = await listWebPortfolioHoldingsForUser(input.supabase, input.userKey as OfficeUserKey);
    await syncGoogleFinanceQuoteSheetRows(
      holdings.map((holding) => ({
        market: holding.market,
        symbol: holding.symbol,
        displayName: holding.name,
        quoteSymbol: holding.quote_symbol ?? undefined,
        googleTicker: holding.google_ticker ?? undefined,
      })),
    );
    const requestId = `quote_recovery_${Date.now().toString(36)}`;
    const readback = await readGoogleFinanceQuoteSheetRows().catch(() => undefined);
    const diagnostics = readback ? buildPortfolioQuoteReadbackDiagnostics({ holdings, rows: readback.rows }) : undefined;
    refreshLifecycleFromDiagnostics({
      refreshedCount: holdings.filter((h) => Boolean(h.google_ticker?.trim())).length,
      diagnostics,
    });
    results.refresh_missing_quotes = { ...refreshStep, status: "passed", requestId, resultSummaryKo: "refresh requested" };
    results.recheck_quote_status = {
      ...base.steps.find((s) => s.key === "recheck_quote_status")!,
      status: diagnostics?.quoteUsabilityStatus === "ok" ? "passed" : "warning",
      resultSummaryKo: diagnostics
        ? `recheck ${diagnostics.quoteUsabilityStatus}, missing ${diagnostics.failedSymbols.length}`
        : "read-back pending",
    };
    if ((diagnostics?.rowsFormulaPending ?? 0) > 0) {
      const wait = base.steps.find((s) => s.key === "wait_formula_readback")!;
      results.wait_formula_readback = { ...wait, status: "warning", resultSummaryKo: "30~60초 후 다시 확인하세요." };
    }
  } else if (refreshStep) {
    results.refresh_missing_quotes = { ...refreshStep, status: "skipped", resultSummaryKo: "이미 사용 가능한 시세가 있어 자동 refresh를 생략했습니다." };
  }

  if (input.request.allowSheetsRepair) {
    const settings = base.steps.find((s) => s.key === "open_google_finance_settings")!;
    results.open_google_finance_settings = {
      ...settings,
      status: "warning",
      resultSummaryKo: "allowSheetsRepair=true여도 이 runbook은 repair write를 자동 실행하지 않습니다.",
    };
  }

  return {
    ...buildPlan(runtime, results),
    status: "completed",
    writeAction: Boolean(results.refresh_missing_quotes?.status === "passed"),
  };
}
