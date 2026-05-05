import { describe, expect, it } from "vitest";
import {
  buildMainDrivers,
  buildRiskNotes,
  buildSectorRadarExplanation,
  buildSectorRadarScoreQuality,
  classifySectorRadarConfidence,
  computeAdjustedScore,
  computeQuoteCoveragePenalty,
  computeQuoteCoverageRatio,
  computeSampleCountPenalty,
  resolveSectorRadarTemperature,
  shouldLabelTemperatureNoData,
} from "../sectorRadarScoreExplanation";

describe("sector radar score quality & penalties", () => {
  it("classifies confidence per sample/coverage/missing rules", () => {
    expect(
      classifySectorRadarConfidence({
        sampleCount: 5,
        quoteCoverageRatio: 0.9,
        quoteMissingCount: 0,
      }),
    ).toBe("high");
    expect(
      classifySectorRadarConfidence({
        sampleCount: 5,
        quoteCoverageRatio: 0.85,
        quoteMissingCount: 2,
      }),
    ).toBe("medium");
    expect(
      classifySectorRadarConfidence({
        sampleCount: 4,
        quoteCoverageRatio: 0.65,
        quoteMissingCount: 2,
      }),
    ).toBe("medium");
    expect(
      classifySectorRadarConfidence({
        sampleCount: 3,
        quoteCoverageRatio: 0.45,
        quoteMissingCount: 2,
      }),
    ).toBe("low");
    expect(
      classifySectorRadarConfidence({
        sampleCount: 2,
        quoteCoverageRatio: 1,
        quoteMissingCount: 0,
      }),
    ).toBe("very_low");
    expect(
      classifySectorRadarConfidence({
        sampleCount: 5,
        quoteCoverageRatio: 0.35,
        quoteMissingCount: 3,
      }),
    ).toBe("very_low");
  });

  it("computes sample penalties", () => {
    expect(computeSampleCountPenalty(5)).toBe(0);
    expect(computeSampleCountPenalty(4)).toBe(-3);
    expect(computeSampleCountPenalty(3)).toBe(-5);
    expect(computeSampleCountPenalty(2)).toBe(-10);
    expect(computeSampleCountPenalty(1)).toBe(0);
  });

  it("computes quote coverage penalties", () => {
    expect(computeQuoteCoveragePenalty(0.9)).toBe(0);
    expect(computeQuoteCoveragePenalty(0.7)).toBe(-5);
    expect(computeQuoteCoveragePenalty(0.5)).toBe(-10);
    expect(computeQuoteCoveragePenalty(0.2)).toBe(-10);
  });

  it("computes quote coverage ratio", () => {
    expect(computeQuoteCoverageRatio(4, 5)).toBe(0.8);
    expect(computeQuoteCoverageRatio(0, 5)).toBe(0);
  });

  it("computes adjusted score from penalties", () => {
    const q = buildSectorRadarScoreQuality({
      sampleCount: 4,
      quoteOkCount: 3,
      quoteMissingCount: 1,
    });
    expect(q.confidencePenalty).toBe(-3 + -5);
    expect(computeAdjustedScore(75, q)).toBe(67);
  });

  it("flags NO_DATA temperature label when coverage very low", () => {
    expect(
      shouldLabelTemperatureNoData({
        zone: "greed",
        sampleCount: 5,
        quoteCoverageRatio: 0.2,
        quoteOkCount: 1,
      }),
    ).toBe(true);
  });
});

describe("sector radar explanation strings", () => {
  it("builds mainDrivers and riskNotes", () => {
    const breakdown = {
      momentum: 22,
      volume: 20,
      week52Position: 13,
      trend: 14,
      quality: 9,
    };
    const quality = buildSectorRadarScoreQuality({
      sampleCount: 5,
      quoteOkCount: 5,
      quoteMissingCount: 0,
    });
    const drivers = buildMainDrivers({
      breakdown,
      quoteCoverageRatio: 1,
      isCrypto: false,
    });
    expect(drivers.some((d) => d.includes("모멘텀"))).toBe(true);
    const risks = buildRiskNotes({
      breakdown,
      quality,
      temperature: "과열",
      linkedWatchlistCount: 0,
      isCrypto: false,
    });
    expect(risks.some((r) => r.includes("52주"))).toBe(true);
    expect(risks.some((r) => r.includes("관심종목"))).toBe(true);
  });

  it("resolves 위험 temperature on extreme overheat", () => {
    const quality = buildSectorRadarScoreQuality({
      sampleCount: 5,
      quoteOkCount: 5,
      quoteMissingCount: 0,
    });
    const t = resolveSectorRadarTemperature({
      zone: "extreme_greed",
      rawScore: 88,
      breakdown: {
        momentum: 20,
        volume: 28,
        week52Position: 14,
        trend: 16,
        quality: 10,
      },
      quality,
    });
    expect(t).toBe("위험");
  });

  it("buildSectorRadarExplanation links watchlist narrative", () => {
    const quality = buildSectorRadarScoreQuality({
      sampleCount: 5,
      quoteOkCount: 5,
      quoteMissingCount: 0,
    });
    const withWl = buildSectorRadarExplanation({
      rawScore: 60,
      adjustedScore: 60,
      breakdown: {
        momentum: 15,
        volume: 12,
        week52Position: 8,
        trend: 12,
        quality: 9,
      },
      quality,
      linkedWatchlistCount: 2,
      zone: "neutral",
      sectorName: "테스트",
      sectorKey: "test",
    });
    expect(withWl.interpretation).toContain("관찰 우선순위");

    const noWl = buildSectorRadarExplanation({
      rawScore: 60,
      adjustedScore: 60,
      breakdown: {
        momentum: 15,
        volume: 12,
        week52Position: 8,
        trend: 12,
        quality: 9,
      },
      quality,
      linkedWatchlistCount: 0,
      zone: "neutral",
      sectorName: "테스트",
      sectorKey: "test",
    });
    expect(noWl.interpretation).toContain("시장 표본");
  });
});
