import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  listHoldings: vi.fn(),
  configured: vi.fn(),
  readRows: vi.fn(),
  syncRows: vi.fn(),
  setupCheck: vi.fn(),
  diagnostics: vi.fn(),
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
  buildPortfolioQuoteReadbackDiagnostics: mocks.diagnostics,
  refreshLifecycleFromDiagnostics: vi.fn(() => []),
}));

import { buildQuoteRecoveryRunbookPlan, executeQuoteRecoveryRunbook } from "@/lib/server/quoteRecoveryRunbook";

describe("quoteRecoveryRunbook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listHoldings.mockResolvedValue([{ market: "US", symbol: "NVDA", name: "NVIDIA", google_ticker: "NASDAQ:NVDA" }]);
    mocks.configured.mockReturnValue(true);
    mocks.readRows.mockResolvedValue({ rows: [] });
    mocks.setupCheck.mockResolvedValue({ usAnchor: { ok: 1 } });
  });

  it("includes refresh step when quotes are missing", async () => {
    mocks.diagnostics.mockReturnValue({
      quoteUsabilityStatus: "partial",
      rowsWithPrice: 0,
      rowsFormulaPending: 0,
      rowsInvalidTicker: 0,
      rowsMissingGoogleTicker: 0,
      failedSymbols: ["US:NVDA"],
    });

    const plan = await buildQuoteRecoveryRunbookPlan({} as never, "u1");

    expect(plan.steps.find((s) => s.key === "refresh_missing_quotes")?.canRunAfterUserClick).toBe(true);
    expect(plan.writeAction).toBe(false);
    expect(plan.autoTrading).toBe(false);
  });

  it("skips refresh when quotes are already usable", async () => {
    mocks.diagnostics.mockReturnValue({
      quoteUsabilityStatus: "ok",
      rowsWithPrice: 1,
      rowsFormulaPending: 0,
      rowsInvalidTicker: 0,
      rowsMissingGoogleTicker: 0,
      failedSymbols: [],
    });

    const result = await executeQuoteRecoveryRunbook({
      supabase: {} as never,
      userKey: "u1",
      request: { confirm: true, scope: "portfolio", allowSheetsRepair: false },
    });

    expect(result.steps.find((s) => s.key === "refresh_missing_quotes")?.status).toBe("skipped");
    expect(mocks.syncRows).not.toHaveBeenCalled();
  });
});
