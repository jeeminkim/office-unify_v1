import { describe, expect, it } from "vitest";
import { summarizeTodayCandidateOps } from "./todayCandidatesOpsSummary";

describe("todayCandidatesOpsSummary", () => {
  it("maps code totals correctly", () => {
    const now = new Date().toISOString();
    const rows = [
      { code: "today_candidates_generated", occurrence_count: 2, last_seen_at: now, detail: {} },
      { code: "today_candidates_us_market_no_data", occurrence_count: 1, last_seen_at: now, detail: {} },
      { code: "today_candidate_watchlist_already_exists", occurrence_count: 1, last_seen_at: now, detail: {} },
    ] as never;
    const out = summarizeTodayCandidateOps(rows, 7);
    expect(out.ok).toBe(true);
    expect(out.totals.generated).toBe(1);
    expect(out.totals.usMarketNoData).toBe(1);
    expect(out.totals.alreadyExists).toBe(1);
  });

  it("aggregates usKrEmptyReasonHistogram from us_signal_candidates_empty detail.primaryReason", () => {
    const now = new Date().toISOString();
    const rows = [
      {
        code: "us_signal_candidates_empty",
        occurrence_count: 2,
        last_seen_at: now,
        detail: { primaryReason: "usToKrMappingEmpty" },
      },
      {
        code: "us_signal_candidates_empty",
        occurrence_count: 1,
        last_seen_at: now,
        detail: {},
      },
      {
        code: "us_signal_candidates_empty",
        occurrence_count: 1,
        last_seen_at: now,
        detail: { primaryReason: "staleUsData" },
      },
    ] as never;
    const out = summarizeTodayCandidateOps(rows, 7);
    expect(out.usKrEmptyReasonHistogram.find((x) => x.reason === "usToKrMappingEmpty")?.count).toBe(2);
    expect(out.usKrEmptyReasonHistogram.find((x) => x.reason === "unknown")?.count).toBe(1);
    expect(out.usKrEmptyReasonHistogram.find((x) => x.reason === "staleUsData")?.count).toBe(1);
  });
});
