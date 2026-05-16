import { describe, expect, it } from "vitest";
import {
  buildSectorRadarSummaryBatchDegradedDetail,
  buildSectorRadarSummaryBatchDegradedFingerprint,
  buildTodayCandidatesSummaryBatchDegradedDetail,
  buildTodayCandidatesSummaryBatchDegradedFingerprint,
  buildTodayCandidatesUsMarketNoDataDetail,
  buildTodayCandidatesUsMarketNoDataFingerprint,
  isReadOnlyCriticalWhitelistCode,
  OPS_READ_ONLY_CRITICAL_WHITELIST_CODES,
  OPS_TODAY_CANDIDATES_EVENT_CODES,
} from "./opsAggregateWarnings";

describe("opsAggregateWarnings whitelist + detail schema", () => {
  it("exposes stable read-only critical whitelist codes", () => {
    expect(OPS_READ_ONLY_CRITICAL_WHITELIST_CODES).toContain("sector_radar_summary_batch_degraded");
    expect(OPS_READ_ONLY_CRITICAL_WHITELIST_CODES).toContain("today_candidates_summary_batch_degraded");
    expect(OPS_READ_ONLY_CRITICAL_WHITELIST_CODES).toContain(OPS_TODAY_CANDIDATES_EVENT_CODES.US_MARKET_NO_DATA);
  });

  it("isReadOnlyCriticalWhitelistCode rejects unknown codes", () => {
    expect(isReadOnlyCriticalWhitelistCode("sector_radar_score_no_data")).toBe(false);
    expect(isReadOnlyCriticalWhitelistCode("today_candidates_us_market_no_data")).toBe(true);
  });

  it("builds stable sector_radar_summary_batch_degraded fingerprint (KST ymd + userKey + reasonCode)", () => {
    const fp = buildSectorRadarSummaryBatchDegradedFingerprint({
      userKey: "user123",
      ymdKst: "20260507",
      reasonCode: "no_data_count_ge_3",
    });
    expect(fp).toBe("sector_radar:user123:20260507:summary_batch_degraded:no_data_count_ge_3");
  });

  it("builds stable today_candidates_summary_batch_degraded fingerprint", () => {
    const fp = buildTodayCandidatesSummaryBatchDegradedFingerprint({
      userKey: "user123",
      ymdKst: "20260507",
    });
    expect(fp).toBe("today_candidates:user123:20260507:summary_batch_degraded");
  });

  it("builds stable today_candidates_us_market_no_data fingerprint with slug", () => {
    const fp = buildTodayCandidatesUsMarketNoDataFingerprint({
      userKey: "user123",
      ymdKst: "20260507",
      emptyReasonSlug: "fetch_failed",
    });
    expect(fp).toBe("today_candidates:user123:20260507:us_market_no_data:fetch_failed");
  });

  it("sector aggregate detail includes reasonCode", () => {
    const d = buildSectorRadarSummaryBatchDegradedDetail({
      yyyyMMdd: "20260507",
      noDataCount: 4,
      quoteMissingSectors: 1,
      veryLowConfidenceCount: 0,
      totalSectors: 12,
    });
    expect(d.schemaVersion).toBe(1);
    expect(d.kind).toBe("sector_radar_summary_batch_degraded");
    expect(d.yyyyMMdd).toBe("20260507");
    expect(d.noDataCount).toBe(4);
    expect(d.quoteMissingSectors).toBe(1);
    expect(d.veryLowConfidenceCount).toBe(0);
    expect(d.totalSectors).toBe(12);
    expect(Array.isArray(d.reasonCodes)).toBe(true);
    expect(d.reasonCodes.length > 0).toBe(true);
    expect(d.skippedIndividualWarnings).toBe(true);
    expect(d.reason).toBe("read_only_aggregate_degraded");
    expect(d.reasonCode).toBe(d.reasonCodes[0]);
  });

  it("today candidates aggregate detail includes required fields", () => {
    const d = buildTodayCandidatesSummaryBatchDegradedDetail({
      yyyyMMdd: "20260507",
      usMarketDataAvailable: false,
      userContextCount: 0,
      usMarketKrCount: 0,
      candidateCount: 0,
      lowConfidenceCount: 0,
      veryLowConfidenceCount: 0,
    });
    expect(d.schemaVersion).toBe(1);
    expect(d.kind).toBe("today_candidates_summary_batch_degraded");
    expect(d.candidateCount).toBe(0);
    expect(d.reasonCodes.length > 0).toBe(true);
    expect(d.skippedIndividualWarnings).toBe(true);
  });

  it("us market no_data detail includes required fields", () => {
    const d = buildTodayCandidatesUsMarketNoDataDetail({
      yyyyMMdd: "20260507",
      usMarketWarnings: ["us_market_quote_unavailable"],
      loggingDecisionReason: "first_seen",
    });
    expect(d.schemaVersion).toBe(1);
    expect(d.kind).toBe("today_candidates_us_market_no_data");
    expect(d.yyyyMMdd).toBe("20260507");
    expect(d.usMarketWarnings).toContain("us_market_quote_unavailable");
    expect(d.loggingDecisionReason).toBe("first_seen");
  });
});
