import { describe, expect, it } from "vitest";
import { usKrEmptyReasonHistogramReasonLabel } from "@office-unify/shared-types";
import { resolveUsKrEmptyHistogramBucketReason, summarizeTodayCandidateOps } from "./todayCandidatesOpsSummary";

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

describe("EVO-006 usKr empty reason histogram", () => {
  it("resolveUsKrEmptyHistogramBucketReason prefers primaryReason", () => {
    expect(resolveUsKrEmptyHistogramBucketReason({ primaryReason: "usToKrMappingEmpty", reasonCodes: ["unknown"] })).toBe(
      "usToKrMappingEmpty",
    );
  });

  it("resolveUsKrEmptyHistogramBucketReason falls back to reasonCodes[0]", () => {
    expect(resolveUsKrEmptyHistogramBucketReason({ reasonCodes: ["staleUsData", "usToKrMappingEmpty"] })).toBe(
      "staleUsData",
    );
  });

  it("resolveUsKrEmptyHistogramBucketReason returns unknown when detail missing", () => {
    expect(resolveUsKrEmptyHistogramBucketReason(undefined)).toBe("unknown");
    expect(resolveUsKrEmptyHistogramBucketReason({})).toBe("unknown");
  });

  it("aggregates primaryReason and applies lastSeenAt max per bucket", () => {
    const tNew = new Date().toISOString();
    const tOld = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const out = summarizeTodayCandidateOps(
      [
        {
          code: "us_signal_candidates_empty",
          occurrence_count: 2,
          last_seen_at: tOld,
          detail: { primaryReason: "usToKrMappingEmpty" },
        },
        {
          code: "us_signal_candidates_empty",
          occurrence_count: 1,
          last_seen_at: tNew,
          detail: { primaryReason: "usToKrMappingEmpty" },
        },
      ] as never,
      7,
    );
    const row = out.usKrEmptyReasonHistogram.find((x) => x.reason === "usToKrMappingEmpty");
    expect(row?.count).toBe(3);
    expect(row?.lastSeenAt).toBe(tNew);
    expect(out.qualityMeta?.todayCandidates?.usKrEmptyReasonHistogram.totalCount).toBe(3);
    expect(out.qualityMeta?.todayCandidates?.usKrEmptyReasonHistogram.range).toBe("7d");
  });

  it("uses 24h histogram label when windowDays is 1", () => {
    const now = new Date().toISOString();
    const out = summarizeTodayCandidateOps(
      [
        {
          code: "us_signal_candidates_empty",
          occurrence_count: 1,
          last_seen_at: now,
          detail: { primaryReason: "unknown" },
        },
      ] as never,
      1,
    );
    expect(out.qualityMeta?.todayCandidates?.usKrEmptyReasonHistogram.range).toBe("24h");
  });

  it("usKrEmptyReasonHistogramReasonLabel covers known codes", () => {
    expect(usKrEmptyReasonHistogramReasonLabel("usToKrMappingEmpty")).toContain("한국");
    expect(usKrEmptyReasonHistogramReasonLabel("custom_unknown_code")).toContain("custom_unknown_code");
  });
});
