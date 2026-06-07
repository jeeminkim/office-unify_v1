import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listHoldings: vi.fn(async () => [{ market: "US", symbol: "NVDA", name: "NVIDIA" }]),
  configured: vi.fn(() => false),
  readRows: vi.fn(),
  syncRows: vi.fn(),
  setupCheck: vi.fn(),
}));

vi.mock("@office-unify/supabase-access", () => ({
  listWebPortfolioHoldingsForUser: mocks.listHoldings,
}));

vi.mock("@/lib/server/googleFinanceSheetQuoteService", () => ({
  isGoogleFinanceQuoteConfigured: mocks.configured,
  readGoogleFinanceQuoteSheetRows: mocks.readRows,
  syncGoogleFinanceQuoteSheetRows: mocks.syncRows,
}));

vi.mock("@/lib/server/googleFinanceSetupCheck", () => ({
  runGoogleFinanceSetupCheck: mocks.setupCheck,
}));

vi.mock("@/lib/server/quotePipelineDiagnostics", () => ({
  buildPortfolioQuoteReadbackDiagnostics: vi.fn(() => ({
    quoteUsabilityStatus: "ok",
    rowsFormulaPending: 0,
    failedSymbols: [],
  })),
  refreshLifecycleFromDiagnostics: vi.fn(() => []),
}));

import {
  buildDataReadinessRunbookPlanFromRuntime,
  executeDataReadinessRunbook,
} from "@/lib/server/opsRunbookExecutor";

describe("opsRunbookExecutor", () => {
  it("builds runtime plan without writing when Google Finance is not configured", async () => {
    const plan = await buildDataReadinessRunbookPlanFromRuntime({} as never, "user1");

    expect(plan.status).toBe("needs_action");
    expect(plan.writeAction).toBe(false);
    expect(mocks.syncRows).not.toHaveBeenCalled();
  });

  it("skips quote refresh when provider is not configured", async () => {
    const result = await executeDataReadinessRunbook({
      authUserKey: "user1",
      supabase: {} as never,
      request: { confirm: true, scope: "us_data_readiness", allowConfirmedSheetRepair: false },
    });

    expect(result.writeAction).toBe(false);
    expect(result.plan.steps.find((s) => s.key === "refresh_portfolio_quotes")?.result).toBe("skipped");
    expect(result.messages.join(" ")).toContain("건너뛰었습니다");
  });
});
