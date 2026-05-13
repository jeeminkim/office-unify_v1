import { describe, expect, it } from "vitest";
import type { ConcentrationRiskAssessment, SuitabilityAssessment } from "@office-unify/shared-types";
import type { TodayStockCandidate } from "@/lib/todayCandidatesContract";
import {
  buildObservationScoreExplanation,
  buildTodayBriefScoreExplanationSummary,
  enrichPrimaryCandidateDeckScoreExplanations,
  usKrEmptyReasonToFriendlyMessage,
} from "./todayBriefScoreExplanation";

function baseCandidate(partial: Partial<TodayStockCandidate>): TodayStockCandidate {
  return {
    candidateId: "x",
    name: "Name",
    market: "KOSPI",
    country: "KR",
    source: "user_context",
    score: 60,
    confidence: "medium",
    riskLevel: "medium",
    reasonSummary: "요약",
    reasonDetails: [],
    positiveSignals: [],
    cautionNotes: [],
    relatedUserContext: [],
    relatedWatchlistSymbols: [],
    isBuyRecommendation: false,
    ...partial,
  };
}

describe("buildObservationScoreExplanation", () => {
  it("theme_link factor is explanatory only (no score points)", () => {
    const out = buildObservationScoreExplanation({
      candidate: baseCandidate({
        themeConnection: {
          themeKey: "biotech",
          themeLabel: "바이오",
          confidence: "low",
          reason: "부분 매칭",
        },
      }),
      finalObservationScore: 60,
    });
    const tf = out.factors.find((f) => f.code === "theme_link");
    expect(tf).toBeDefined();
    expect(tf?.points).toBeUndefined();
  });

  it("adds interest_match for user_context", () => {
    const out = buildObservationScoreExplanation({
      candidate: baseCandidate({ source: "user_context", alreadyInWatchlist: true }),
      finalObservationScore: 55,
    });
    expect(out.factors.some((f) => f.code === "interest_match" && f.direction === "positive")).toBe(true);
    expect(out.factors.some((f) => f.code === "watchlist_match")).toBe(true);
  });

  it("adds sector_radar_match for sector ETF slot", () => {
    const out = buildObservationScoreExplanation({
      candidate: baseCandidate({
        source: "sector_radar",
        briefDeckSlot: "sector_etf",
      }),
      finalObservationScore: 72,
    });
    expect(out.factors.some((f) => f.code === "sector_radar_match")).toBe(true);
  });

  it("adds suitability_adjustment negative factor with points", () => {
    const suit: SuitabilityAssessment = {
      profileStatus: "complete",
      scoreAdjustment: -6,
      warningCodes: ["high_volatility_for_low_risk"],
      userMessage: "저위험 성향 대비 변동성이 큽니다.",
    };
    const out = buildObservationScoreExplanation({
      candidate: baseCandidate({}),
      finalObservationScore: 54,
      suitabilityAssessment: suit,
    });
    const adj = out.factors.find((f) => f.code === "suitability_adjustment");
    expect(adj?.direction).toBe("negative");
    expect(adj?.points).toBe(-6);
    expect(out.baseScore).toBe(60);
    expect(out.finalScore).toBe(54);
  });

  it("adds quote_quality warning when quote missing", () => {
    const out = buildObservationScoreExplanation({
      candidate: baseCandidate({
        dataQuality: {
          overall: "medium",
          badges: [],
          reasons: [],
          warnings: [],
          quoteReady: false,
        },
      }),
      finalObservationScore: 50,
    });
    expect(out.factors.some((f) => f.code === "quote_quality" && f.direction === "negative")).toBe(true);
  });

  it("adds neutral us_market_signal when KR mapping empty diagnostic attached", () => {
    const out = buildObservationScoreExplanation({
      candidate: baseCandidate({ source: "user_context" }),
      finalObservationScore: 60,
      usKrSignalEmpty: {
        primaryReason: "usToKrMappingEmpty",
        userMessage: "매핑 없음",
      },
    });
    const us = out.factors.filter((f) => f.code === "us_market_signal");
    expect(us.length).toBeGreaterThanOrEqual(1);
    expect(us[0]?.direction).toBe("neutral");
    expect(us[0]?.message).toContain("인위적으로");
  });

  it("uses friendly message for usKr empty reason code", () => {
    const msg = usKrEmptyReasonToFriendlyMessage("usToKrMappingEmpty");
    expect(msg).toContain("한국");
    expect(msg).not.toMatch(/usToKr/i);
  });

  it("caveat states not buy recommendation", () => {
    const out = buildObservationScoreExplanation({
      candidate: baseCandidate({}),
      finalObservationScore: 40,
    });
    expect(out.caveat).toContain("매수 추천이 아니라");
    expect(out.summary).toContain("매수 권유가 아닙니다");
  });

  it("finalScore matches observationScore input", () => {
    const obs = 63;
    const out = buildObservationScoreExplanation({
      candidate: baseCandidate({}),
      finalObservationScore: obs,
    });
    expect(out.finalScore).toBe(obs);
  });

  it("profile_missing uses neutral suitability without skewing baseScore beyond adjustment", () => {
    const suit: SuitabilityAssessment = {
      profileStatus: "missing",
      scoreAdjustment: 0,
      warningCodes: ["profile_missing"],
      userMessage: "프로필 미설정",
    };
    const out = buildObservationScoreExplanation({
      candidate: baseCandidate({}),
      finalObservationScore: 58,
      suitabilityAssessment: suit,
    });
    expect(out.baseScore).toBe(58);
    const sf = out.factors.find((f) => f.code === "suitability_adjustment");
    expect(sf?.direction).toBe("neutral");
  });

  it("adds portfolio_concentration factor when concentration risk is elevated", () => {
    const conc: ConcentrationRiskAssessment = {
      level: "high",
      reasonCodes: ["theme_overweight"],
      userMessage: "테마 비중이 높을 수 있어 관찰 전 점검을 권합니다.",
      dataQuality: "ok",
    };
    const out = buildObservationScoreExplanation({
      candidate: baseCandidate({}),
      finalObservationScore: 55,
      concentrationRiskAssessment: conc,
    });
    const cf = out.factors.find((f) => f.code === "portfolio_concentration");
    expect(cf?.direction).toBe("negative");
    expect(cf?.message).toContain("테마");
  });
});

describe("enrichPrimaryCandidateDeckScoreExplanations + summary", () => {
  it("attaches scoreExplanationDetail and aggregates factorCounts", () => {
    const dm = {
      observationScore: 61,
      scoreLabel: "보통" as const,
      confidenceLabel: "보통" as const,
      dataQualityLabel: "dq",
      relationLabel: "rel",
      scoreExplanation: "legacy",
    };
    const conc: ConcentrationRiskAssessment = {
      level: "medium",
      reasonCodes: ["sector_overweight"],
      userMessage: "섹터 비중 참고.",
      dataQuality: "partial",
    };
    const deck: TodayStockCandidate[] = [
      {
        ...baseCandidate({ candidateId: "a", source: "user_context", alreadyInWatchlist: true }),
        concentrationRiskAssessment: conc,
        displayMetrics: dm,
      },
      {
        ...baseCandidate({
          candidateId: "b",
          source: "sector_radar",
          briefDeckSlot: "sector_etf",
        }),
        displayMetrics: { ...dm, observationScore: 80 },
      },
    ];
    const enriched = enrichPrimaryCandidateDeckScoreExplanations(deck, {
      usKrSignalDiagnostics: null,
      usMarketKrCount: 2,
      repeatByCandidateId: new Map([["a", { candidateRepeatCount7d: 3, lastShownAt: "2026-05-10T00:00:00.000Z" }]]),
    });
    expect(enriched[0]?.displayMetrics?.scoreExplanationDetail?.finalScore).toBe(61);
    expect(enriched[0]?.displayMetrics?.scoreExplanation).toBe("legacy");
    const summary = buildTodayBriefScoreExplanationSummary(enriched, "complete");
    expect(summary.explainedCandidateCount).toBe(2);
    expect((summary.factorCounts.interest_match ?? 0) >= 1).toBe(true);
    expect((summary.factorCounts.sector_radar_match ?? 0) >= 1).toBe(true);
    expect((summary.factorCounts.portfolio_concentration ?? 0) >= 1).toBe(true);
    expect((summary.factorCounts.repeat_exposure ?? 0) >= 1).toBe(true);
    expect(summary.repeatedCandidateCount).toBe(1);
    expect(summary.diversityPolicy?.length).toBeGreaterThan(10);
    expect(summary.profileStatus).toBe("complete");
  });
});
