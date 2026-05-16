import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { CandidateSheetParsedRow } from "@/lib/server/googleFinanceTickerCandidateSheet";
import { buildTickerResolverStatusPayload } from "@/lib/server/tickerResolverStatusEnvelope";

function row(partial: Partial<CandidateSheetParsedRow>): CandidateSheetParsedRow {
  return {
    requestId: "rid-a",
    targetType: "holding",
    market: "KR",
    symbol: "005930",
    candidateTicker: "KRX:005930",
    sheetConfidence: "high",
    ...partial,
  };
}

describe("buildTickerResolverStatusPayload lifecycle + recommendation alignment", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T12:00:00.000Z"));
    process.env.TICKER_RESOLVER_TIMEOUT_MS = "10000";
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TICKER_RESOLVER_TIMEOUT_MS;
  });

  it("stays pending while elapsed < timeoutMs when candidates are pending", () => {
    const parsed = [
      row({
        rawPrice: "",
        parsedPrice: undefined,
        currency: "",
        createdAt: new Date("2026-05-16T11:59:59.000Z").toISOString(),
      }),
    ];
    const out = buildTickerResolverStatusPayload({ requestId: "rid-a", parsed });
    expect(out.status).toBe("pending");
    expect(out.summary.pendingCandidateCount).toBe(1);
    expect(out.rows[0]?.status).toBe("pending");
    expect(out.recommendations[0]?.candidates[0]?.status).toBe("pending");
  });

  it("expires pending rows to timeout when elapsed >= timeoutMs", () => {
    const parsed = [
      row({
        rawPrice: "",
        parsedPrice: undefined,
        currency: "",
        createdAt: new Date("2026-05-16T11:58:00.000Z").toISOString(),
      }),
    ];
    const out = buildTickerResolverStatusPayload({ requestId: "rid-a", parsed });
    expect(out.status).toBe("timeout");
    expect(out.rows[0]?.status).toBe("timeout");
    expect(out.rows[0]?.applyDisabledReason).toMatch(/timeout/);
    const cand = out.recommendations[0]?.candidates[0];
    expect(cand?.status).toBe("timeout");
    expect(cand?.applyDisabledReason).toMatch(/timeout/);
  });

  it("becomes partial when some candidates stay pending(timeout) and others are ok after deadline", () => {
    const parsed = [
      row({
        rawPrice: "",
        parsedPrice: undefined,
        currency: "",
        candidateTicker: "KRX:005930",
        createdAt: new Date("2026-05-16T11:58:00.000Z").toISOString(),
      }),
      row({
        rawPrice: "70000",
        parsedPrice: 70000,
        currency: "KRW",
        candidateTicker: "KOSDAQ:005930",
        createdAt: new Date("2026-05-16T11:58:00.000Z").toISOString(),
      }),
    ];
    const out = buildTickerResolverStatusPayload({ requestId: "rid-a", parsed });
    expect(out.status).toBe("partial");
    expect(out.summary.readyCandidateCount).toBeGreaterThanOrEqual(1);
    expect(out.summary.timeoutCandidateCount).toBeGreaterThanOrEqual(1);
    const pendingTimed = out.rows.filter((r) => r.status === "timeout");
    expect(pendingTimed.length).toBeGreaterThanOrEqual(1);
  });

  it("marks recommendation.applyState manualRequired after timeout when not fully ok", () => {
    const parsed = [
      row({
        rawPrice: "",
        parsedPrice: undefined,
        currency: "",
        createdAt: new Date("2026-05-16T11:58:00.000Z").toISOString(),
      }),
    ];
    const out = buildTickerResolverStatusPayload({ requestId: "rid-a", parsed });
    expect(out.recommendations[0]?.applyState.manualRequired).toBe(true);
    expect(out.recommendations[0]?.applyState.reason).toMatch(/timeout/i);
  });
});
