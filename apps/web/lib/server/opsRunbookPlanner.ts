import "server-only";

import type { OpsRunbookPlan, OpsRunbookStep } from "@office-unify/shared-types";

type PlannerInput = {
  googleFinanceConfigured?: boolean;
  googleFinanceStatus?: "ok" | "degraded" | "failed" | "not_configured";
  quoteUsabilityStatus?: "ok" | "partial" | "failed" | "formula_pending" | "mapping_required" | "cache_stale";
  formulaPendingCount?: number;
  missingQuoteCount?: number;
  usCoverageStatus?: "ok" | "degraded" | "missing" | "unknown";
  themeMappingNeedsAction?: boolean;
  executionResults?: Partial<Record<OpsRunbookStep["key"], OpsRunbookStep["result"]>>;
};

const RUNBOOK_ID = "us_data_readiness";

function withResult(step: OpsRunbookStep, results?: PlannerInput["executionResults"]): OpsRunbookStep {
  return { ...step, result: results?.[step.key] ?? step.result ?? "pending" };
}

function partitionSteps(steps: OpsRunbookStep[]) {
  return {
    safeToRunSteps: steps.filter((s) => !s.requiresConfirm && s.actionType !== "confirm_write"),
    confirmRequiredSteps: steps.filter((s) => s.requiresConfirm || s.actionType === "confirm_write"),
    blockedSteps: steps.filter((s) => s.result === "failed"),
  };
}

function inferStatus(input: PlannerInput, steps: OpsRunbookStep[]): OpsRunbookPlan["status"] {
  if (steps.some((s) => s.result === "failed")) return "blocked";
  if (input.googleFinanceConfigured === false || input.googleFinanceStatus === "not_configured") return "needs_action";
  if (
    input.googleFinanceStatus === "failed" ||
    input.quoteUsabilityStatus === "failed" ||
    input.quoteUsabilityStatus === "formula_pending" ||
    (input.formulaPendingCount ?? 0) > 0
  ) {
    return "degraded";
  }
  if (
    input.quoteUsabilityStatus === "partial" ||
    input.quoteUsabilityStatus === "mapping_required" ||
    input.quoteUsabilityStatus === "cache_stale" ||
    input.usCoverageStatus === "degraded" ||
    input.usCoverageStatus === "missing" ||
    input.themeMappingNeedsAction
  ) {
    return "needs_action";
  }
  return "ready";
}

export function buildDataReadinessRunbookPlan(input: PlannerInput = {}): OpsRunbookPlan {
  const formulaPending = (input.formulaPendingCount ?? 0) > 0 || input.quoteUsabilityStatus === "formula_pending";
  const quoteNeedsRefresh =
    input.googleFinanceConfigured !== false &&
    (input.quoteUsabilityStatus == null ||
      input.quoteUsabilityStatus === "partial" ||
      input.quoteUsabilityStatus === "failed" ||
      input.quoteUsabilityStatus === "cache_stale" ||
      (input.missingQuoteCount ?? 0) > 0);

  const rawSteps = [
    {
      key: "check_google_finance_setup",
      labelKo: "Google Finance 설정 점검",
      reasonKo: "시세 read-back을 쓸 수 있는지 확인합니다. 이 단계는 읽기 전용입니다.",
      actionType: "read_only",
      endpoint: "/api/system/google-finance-setup",
      method: "GET",
      requiresConfirm: false,
      canAutoRunAfterUserClick: true,
      result:
        input.googleFinanceConfigured === false || input.googleFinanceStatus === "not_configured"
          ? "warning"
          : input.googleFinanceStatus === "failed"
            ? "failed"
            : input.googleFinanceStatus
              ? "passed"
              : "pending",
    },
    {
      key: "check_quote_status",
      labelKo: "Quote status 확인",
      reasonKo: "보유 종목 시세, formula pending, ticker mapping 상태를 분리해서 봅니다.",
      actionType: "read_only",
      endpoint: "/api/portfolio/quotes/status",
      method: "GET",
      requiresConfirm: false,
      canAutoRunAfterUserClick: true,
      result:
        input.googleFinanceConfigured === false
          ? "warning"
          : input.quoteUsabilityStatus === "ok"
          ? "passed"
          : input.quoteUsabilityStatus === "failed"
            ? "failed"
            : input.quoteUsabilityStatus
              ? "warning"
              : "pending",
    },
    {
      key: "refresh_portfolio_quotes",
      labelKo: "포트폴리오 시세 새로고침 요청",
      reasonKo: "사용자 클릭 이후에만 portfolio_quotes 수식 갱신을 요청합니다. 주문이나 매매와 무관합니다.",
      actionType: "explicit_post",
      endpoint: "/api/portfolio/quotes/refresh",
      method: "POST",
      requiresConfirm: true,
      canAutoRunAfterUserClick: quoteNeedsRefresh,
      result: quoteNeedsRefresh ? "pending" : "skipped",
    },
    {
      key: "wait_formula_readback",
      labelKo: "수식 read-back 대기",
      reasonKo: "Google Finance formula가 pending이면 성공으로 처리하지 않고 재확인 대기로 남깁니다.",
      actionType: "wait",
      requiresConfirm: false,
      canAutoRunAfterUserClick: false,
      result: formulaPending ? "warning" : "skipped",
    },
    {
      key: "resolve_watchlist_tickers",
      labelKo: "관심종목 ticker mapping 재점검",
      reasonKo: "Smart Ticker Resolve는 후보 계산만 수행하며 관심종목 저장은 별도 추가 버튼에서만 이뤄집니다.",
      actionType: "read_only",
      endpoint: "/api/portfolio/watchlist/resolve",
      method: "POST",
      requiresConfirm: false,
      canAutoRunAfterUserClick: true,
      result: input.quoteUsabilityStatus === "mapping_required" ? "warning" : "pending",
    },
    {
      key: "run_discovery_universe",
      labelKo: "후보 universe 진단",
      reasonKo: "후보를 강제로 만들지 않고 US coverage와 discovery 입력 상태만 진단합니다.",
      actionType: "read_only",
      endpoint: "/api/dashboard/today-brief",
      method: "GET",
      requiresConfirm: false,
      canAutoRunAfterUserClick: true,
      result: input.usCoverageStatus === "missing" || input.usCoverageStatus === "degraded" ? "warning" : "pending",
    },
    {
      key: "check_theme_mapping",
      labelKo: "Theme mapping 확인",
      reasonKo: "미국 signal과 보유/관심 테마 연결이 비어 있는지 확인합니다.",
      actionType: "navigate",
      endpoint: "/sector-radar",
      requiresConfirm: false,
      canAutoRunAfterUserClick: false,
      result: input.themeMappingNeedsAction ? "warning" : "pending",
    },
    {
      key: "rerun_today_brief",
      labelKo: "Today Brief 재확인",
      reasonKo: "갱신된 상태를 읽기 전용 Today Brief로 다시 확인합니다. 후보 생성은 강제하지 않습니다.",
      actionType: "read_only",
      endpoint: "/api/dashboard/today-brief",
      method: "GET",
      requiresConfirm: false,
      canAutoRunAfterUserClick: true,
      result: "pending",
    },
    {
      key: "open_quote_provider_status",
      labelKo: "Quote provider 상태 열기",
      reasonKo: "실시간 provider가 없거나 fallback 상태인 이유를 별도 상태 화면에서 확인합니다.",
      actionType: "navigate",
      endpoint: "/ops/google-finance-setup",
      requiresConfirm: false,
      canAutoRunAfterUserClick: false,
      result: "pending",
    },
  ] satisfies OpsRunbookStep[];
  const steps = rawSteps.map((step) => withResult(step, input.executionResults));

  const status = inferStatus(input, steps);
  const summary =
    status === "ready"
      ? "미국 데이터 준비 흐름을 실행할 수 있습니다. 시세 상태, ticker mapping, theme mapping, candidate universe를 순서대로 재점검합니다."
      : status === "degraded"
        ? "일부 데이터가 pending 또는 degraded입니다. 실행 후에도 read-back 대기나 수동 점검이 남을 수 있습니다."
        : status === "blocked"
          ? "필수 점검 중 실패가 있어 먼저 설정 또는 권한을 확인해야 합니다."
          : "실행 전에 설정, mapping, coverage 중 확인이 필요한 항목이 있습니다.";

  return {
    status,
    runbookId: RUNBOOK_ID,
    title: "미국 데이터 준비 One-Click Runbook",
    summary,
    steps,
    ...partitionSteps(steps),
    expectedOutcome:
      "Quote status, ticker mapping, theme mapping, candidate universe를 한 번에 재점검하고 결과를 단계별로 표시합니다. 자동매매, 자동주문, 자동 관심종목 저장은 수행하지 않습니다.",
    writeAction: false,
  };
}
