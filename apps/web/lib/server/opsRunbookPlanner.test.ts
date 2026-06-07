import { describe, expect, it } from "vitest";
import { buildDataReadinessRunbookPlan } from "@/lib/server/opsRunbookPlanner";

describe("buildDataReadinessRunbookPlan", () => {
  it("returns plan-only contract with no write action", () => {
    const plan = buildDataReadinessRunbookPlan({
      googleFinanceConfigured: true,
      googleFinanceStatus: "ok",
      quoteUsabilityStatus: "ok",
      usCoverageStatus: "ok",
    });

    expect(plan.runbookId).toBe("us_data_readiness");
    expect(plan.writeAction).toBe(false);
    expect(plan.steps.map((s) => s.key)).toContain("check_quote_status");
    expect(plan.steps.find((s) => s.key === "refresh_portfolio_quotes")?.requiresConfirm).toBe(true);
    expect(plan.steps.find((s) => s.key === "resolve_watchlist_tickers")?.requiresConfirm).toBe(false);
  });

  it("marks formula pending as degraded wait guidance", () => {
    const plan = buildDataReadinessRunbookPlan({
      googleFinanceConfigured: true,
      googleFinanceStatus: "degraded",
      quoteUsabilityStatus: "formula_pending",
      formulaPendingCount: 2,
    });

    expect(plan.status).toBe("degraded");
    expect(plan.steps.find((s) => s.key === "wait_formula_readback")?.result).toBe("warning");
    expect(plan.expectedOutcome).toContain("자동매매");
  });

  it("does not allow auto refresh when Google Finance is not configured", () => {
    const plan = buildDataReadinessRunbookPlan({
      googleFinanceConfigured: false,
      googleFinanceStatus: "not_configured",
      quoteUsabilityStatus: "failed",
    });

    expect(plan.status).toBe("needs_action");
    expect(plan.steps.find((s) => s.key === "refresh_portfolio_quotes")?.canAutoRunAfterUserClick).toBe(false);
  });
});
