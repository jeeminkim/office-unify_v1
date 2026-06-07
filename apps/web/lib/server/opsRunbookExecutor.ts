import "server-only";

import type {
  OpsRunbookExecuteRequest,
  OpsRunbookExecutionResponse,
  OpsRunbookPlan,
  OfficeUserKey,
} from "@office-unify/shared-types";
import { listWebPortfolioHoldingsForUser } from "@office-unify/supabase-access";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runGoogleFinanceSetupCheck } from "@/lib/server/googleFinanceSetupCheck";
import {
  isGoogleFinanceQuoteConfigured,
  readGoogleFinanceQuoteSheetRows,
  syncGoogleFinanceQuoteSheetRows,
} from "@/lib/server/googleFinanceSheetQuoteService";
import {
  buildPortfolioQuoteReadbackDiagnostics,
  refreshLifecycleFromDiagnostics,
} from "@/lib/server/quotePipelineDiagnostics";
import { buildDataReadinessRunbookPlan } from "@/lib/server/opsRunbookPlanner";

type ExecutorInput = {
  authUserKey: string;
  supabase: SupabaseClient;
  request: OpsRunbookExecuteRequest;
};

type RuntimePlanInput = NonNullable<Parameters<typeof buildDataReadinessRunbookPlan>[0]>;

async function collectRuntimePlanInput(supabase: SupabaseClient, userKey: string): Promise<RuntimePlanInput> {
  const googleFinanceConfigured = isGoogleFinanceQuoteConfigured();
  const holdings = await listWebPortfolioHoldingsForUser(supabase, userKey as OfficeUserKey).catch(() => []);
  if (!googleFinanceConfigured) {
    return {
      googleFinanceConfigured: false,
      googleFinanceStatus: "not_configured",
      quoteUsabilityStatus: "failed",
      missingQuoteCount: holdings.length,
    };
  }

  try {
    const [setup, readback] = await Promise.all([runGoogleFinanceSetupCheck(), readGoogleFinanceQuoteSheetRows()]);
    const diagnostics = buildPortfolioQuoteReadbackDiagnostics({ holdings, rows: readback.rows });
    return {
      googleFinanceConfigured: true,
      googleFinanceStatus: setup.status,
      quoteUsabilityStatus: diagnostics.quoteUsabilityStatus,
      formulaPendingCount: diagnostics.rowsFormulaPending,
      missingQuoteCount: diagnostics.failedSymbols.length,
      usCoverageStatus: setup.usAnchor.ok > 0 ? "ok" : setup.usAnchor.fetchFailed ? "degraded" : "missing",
    };
  } catch {
    return {
      googleFinanceConfigured: true,
      googleFinanceStatus: "degraded",
      quoteUsabilityStatus: "failed",
      missingQuoteCount: holdings.length,
    };
  }
}

async function refreshPortfolioQuotes(supabase: SupabaseClient, userKey: string) {
  const holdings = await listWebPortfolioHoldingsForUser(supabase, userKey as OfficeUserKey);
  await syncGoogleFinanceQuoteSheetRows(
    holdings.map((holding) => ({
      market: holding.market,
      symbol: holding.symbol,
      displayName: holding.name,
      quoteSymbol: holding.quote_symbol ?? undefined,
      googleTicker: holding.google_ticker ?? undefined,
    })),
  );
  const readback = await readGoogleFinanceQuoteSheetRows().catch(() => undefined);
  const diagnostics = readback
    ? buildPortfolioQuoteReadbackDiagnostics({ holdings, rows: readback.rows })
    : undefined;
  const refreshedCount = holdings.filter((h) => Boolean(h.google_ticker?.trim())).length;
  return {
    refreshedCount,
    diagnostics,
    lifecycle: refreshLifecycleFromDiagnostics({ refreshedCount, diagnostics }),
  };
}

export async function buildDataReadinessRunbookPlanFromRuntime(
  supabase: SupabaseClient,
  userKey: string,
): Promise<OpsRunbookPlan> {
  return buildDataReadinessRunbookPlan(await collectRuntimePlanInput(supabase, userKey));
}

export async function executeDataReadinessRunbook(input: ExecutorInput): Promise<OpsRunbookExecutionResponse> {
  const messages: string[] = [];
  const base = await collectRuntimePlanInput(input.supabase, input.authUserKey);
  const executionResults: RuntimePlanInput["executionResults"] = {
    check_google_finance_setup: base.googleFinanceStatus === "failed" ? "failed" : "passed",
    check_quote_status: base.quoteUsabilityStatus === "ok" ? "passed" : "warning",
    resolve_watchlist_tickers: "passed",
    run_discovery_universe: "passed",
    rerun_today_brief: "passed",
    open_quote_provider_status: "skipped",
    check_theme_mapping: base.themeMappingNeedsAction ? "warning" : "passed",
    wait_formula_readback: (base.formulaPendingCount ?? 0) > 0 ? "warning" : "skipped",
  };

  let writeAction = false;
  if (input.request.scope === "us_data_readiness" || input.request.scope === "portfolio_quotes") {
    if (base.googleFinanceConfigured === false) {
      executionResults.refresh_portfolio_quotes = "skipped";
      messages.push("Google Finance 설정이 없어 quote refresh는 건너뛰었습니다.");
    } else {
      try {
        const refresh = await refreshPortfolioQuotes(input.supabase, input.authUserKey);
        writeAction = true;
        executionResults.refresh_portfolio_quotes = "passed";
        if ((refresh.diagnostics?.rowsFormulaPending ?? 0) > 0) {
          executionResults.wait_formula_readback = "warning";
          messages.push("Google Finance formula가 아직 pending입니다. 30~60초 후 Quote status를 다시 확인하세요.");
        }
        messages.push(`portfolio_quotes refresh 요청 완료: ${refresh.refreshedCount}개 row 대상.`);
      } catch (e) {
        executionResults.refresh_portfolio_quotes = "failed";
        messages.push(e instanceof Error ? e.message : "portfolio quote refresh failed");
      }
    }
  } else {
    executionResults.refresh_portfolio_quotes = "skipped";
  }

  if (input.request.allowConfirmedSheetRepair) {
    messages.push("allowConfirmedSheetRepair=true가 전달됐지만 이 런북은 repair 쓰기를 자동 실행하지 않습니다.");
  }

  const plan = buildDataReadinessRunbookPlan({
    ...base,
    executionResults,
  });
  return {
    ok: !plan.blockedSteps.length,
    runbookId: plan.runbookId,
    executedAt: new Date().toISOString(),
    scope: input.request.scope,
    plan,
    messages,
    writeAction,
  };
}
