import { describe, expect, it } from "vitest";
import { buildCandidateDataQuality, filterCandidatesByConfidence } from "./todayCandidateDataQuality";

describe("today candidate data quality", () => {
  it("builds high quality badges", () => {
    const q = buildCandidateDataQuality({
      confidence: "high",
      quoteReady: true,
      sectorConfidence: "high",
      usMarketDataAvailable: true,
      hasWatchlistLink: true,
      cautionNotes: [],
      source: "user_context",
    });
    expect(q.overall).toBe("high");
    expect(q.badges).toContain("신뢰도 높음");
    expect(q.badges).toContain("미국장 신호 확인");
    expect(q.badges.length <= 4).toBe(true);
    expect(q.summary).toBe(undefined);
  });

  it("adds overheat caution and data-limited badge", () => {
    const q = buildCandidateDataQuality({
      confidence: "very_low",
      quoteReady: false,
      sectorConfidence: "low",
      usMarketDataAvailable: false,
      hasWatchlistLink: false,
      cautionNotes: ["과열 구간 추격매수 주의"],
      source: "us_market_morning",
    });
    expect(q.badges).toContain("신뢰도 매우 낮음");
    expect(q.badges).toContain("미국장 데이터 제한");
    expect(q.reasons.some((x) => x.includes("과열"))).toBe(true);
    expect(q.primaryRisk?.code).toBe("overheated_risk");
    expect((q.reasonItems ?? []).length > 0).toBe(true);
    expect(q.summary).toContain("신뢰도 매우 낮음");
    expect(q.summary).toContain("관찰만 권장");
    expect(q.badges.length <= 4).toBe(true);
  });

  it("includes quote check phrase when quote is not ready", () => {
    const q = buildCandidateDataQuality({
      confidence: "low",
      quoteReady: false,
      sectorConfidence: "medium",
      usMarketDataAvailable: true,
      hasWatchlistLink: true,
      cautionNotes: [],
      source: "user_context",
    });
    expect(q.summary).toContain("시세");
    expect(q.summary).toContain("관찰만 권장");
    expect(q.primaryRisk?.code).toBe("quote_missing");
    expect(q.reasons.length).toBe((q.reasonItems ?? []).length);
  });

  it("filters low confidence by default", () => {
    const rows = [
      { candidateId: "a", confidence: "high" },
      { candidateId: "b", confidence: "low" },
      { candidateId: "c", confidence: "very_low" },
      { candidateId: "d", confidence: "medium" },
    ] as never;
    const filtered = filterCandidatesByConfidence(rows, false);
    expect(filtered.map((x: { candidateId: string }) => x.candidateId)).toEqual(["a", "d"]);
  });

  it("uses chasing risk when overheat is absent", () => {
    const q = buildCandidateDataQuality({
      confidence: "low",
      quoteReady: true,
      sectorConfidence: "medium",
      usMarketDataAvailable: true,
      hasWatchlistLink: true,
      cautionNotes: ["추격매수 주의"],
      source: "user_context",
    });
    expect(q.primaryRisk?.code).toBe("chasing_risk");
  });

  it("uses us market no data risk for us candidates", () => {
    const q = buildCandidateDataQuality({
      confidence: "low",
      quoteReady: true,
      sectorConfidence: "high",
      usMarketDataAvailable: false,
      hasWatchlistLink: false,
      cautionNotes: [],
      source: "us_market_morning",
    });
    expect(q.primaryRisk?.code).toBe("us_market_no_data");
  });

  it("uses sector low confidence risk when sector unknown", () => {
    const q = buildCandidateDataQuality({
      confidence: "low",
      quoteReady: true,
      sectorConfidence: "unknown",
      usMarketDataAvailable: true,
      hasWatchlistLink: true,
      cautionNotes: [],
      source: "user_context",
    });
    expect(q.primaryRisk?.code).toBe("sector_low_confidence");
    expect(q.badges.length <= 4).toBe(true);
  });
});
