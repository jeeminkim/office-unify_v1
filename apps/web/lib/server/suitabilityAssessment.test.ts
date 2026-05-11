import { describe, expect, it } from "vitest";
import type { InvestorProfile } from "@office-unify/shared-types";
import type { TodayStockCandidate } from "@/lib/todayCandidatesContract";
import {
  applySuitabilityToPrimaryDeck,
  assessSuitability,
  clampSuitabilityScoreAdjustment,
  buildInvestorProfilePromptContext,
} from "./suitabilityAssessment";

function baseCandidate(over: Partial<TodayStockCandidate>): TodayStockCandidate {
  return {
    candidateId: "c1",
    name: "Test",
    market: "KOSPI",
    country: "KR",
    source: "user_context",
    score: 60,
    confidence: "high",
    riskLevel: "high",
    reasonSummary: "장기 성장 테마",
    reasonDetails: [],
    positiveSignals: [],
    cautionNotes: [],
    relatedUserContext: [],
    relatedWatchlistSymbols: [],
    isBuyRecommendation: false,
    sector: "반도체",
    ...over,
  };
}

describe("suitabilityAssessment", () => {
  it("missing profile yields profile_missing without large score move", () => {
    const a = assessSuitability(baseCandidate({}), null);
    expect(a.warningCodes).toContain("profile_missing");
    expect(a.scoreAdjustment).toBe(0);
  });

  it("low risk + high volatility warns", () => {
    const profile: InvestorProfile = {
      riskTolerance: "low",
      timeHorizon: "mid",
      leveragePolicy: "unknown",
      concentrationLimit: "unknown",
    };
    const a = assessSuitability(baseCandidate({ riskLevel: "high", confidence: "low" }), profile);
    expect(a.warningCodes).toContain("high_volatility_for_low_risk");
    expect(a.scoreAdjustment).toBeLessThanOrEqual(0);
  });

  it("short horizon + long thesis mismatch", () => {
    const profile: InvestorProfile = {
      riskTolerance: "medium",
      timeHorizon: "short",
      leveragePolicy: "limited",
      concentrationLimit: "moderate",
    };
    const a = assessSuitability(
      baseCandidate({
        reasonSummary: "장기 투자 관점에서 업종 구조 변화",
      }),
      profile,
    );
    expect(a.warningCodes).toContain("short_horizon_long_thesis_mismatch");
  });

  it("leverage not allowed on leveraged hint", () => {
    const profile: InvestorProfile = {
      riskTolerance: "medium",
      timeHorizon: "mid",
      leveragePolicy: "not_allowed",
      concentrationLimit: "moderate",
    };
    const a = assessSuitability(baseCandidate({ name: "SOXX 3X 레버리지" }), profile);
    expect(a.warningCodes).toContain("leverage_not_allowed");
  });

  it("sector avoidance match", () => {
    const profile: InvestorProfile = {
      riskTolerance: "medium",
      timeHorizon: "mid",
      leveragePolicy: "allowed",
      concentrationLimit: "flexible",
      avoidSectors: ["바이오"],
    };
    const a = assessSuitability(baseCandidate({ sector: "바이오 신약" }), profile);
    expect(a.warningCodes).toContain("sector_avoidance_match");
  });

  it("concentration strict + many watch symbols", () => {
    const profile: InvestorProfile = {
      riskTolerance: "medium",
      timeHorizon: "mid",
      leveragePolicy: "limited",
      concentrationLimit: "strict",
    };
    const syms = Array.from({ length: 12 }, (_, i) => `KR:${String(i).padStart(6, "0")}`);
    const a = assessSuitability(baseCandidate({ relatedWatchlistSymbols: syms }), profile);
    expect(a.warningCodes).toContain("concentration_risk");
  });

  it("clamps score adjustment", () => {
    expect(clampSuitabilityScoreAdjustment(-50)).toBe(-10);
    expect(clampSuitabilityScoreAdjustment(20)).toBe(5);
  });

  it("applySuitabilityToPrimaryDeck keeps observationScore within bounds", () => {
    const profile: InvestorProfile = {
      riskTolerance: "low",
      timeHorizon: "mid",
      leveragePolicy: "limited",
      concentrationLimit: "moderate",
    };
    const deck = [
      baseCandidate({
        candidateId: "d1",
        displayMetrics: {
          observationScore: 50,
          scoreLabel: "보통",
          confidenceLabel: "낮음",
          dataQualityLabel: "ok",
          relationLabel: "r",
          scoreExplanation: "x",
        },
      }),
    ];
    const out = applySuitabilityToPrimaryDeck(deck as TodayStockCandidate[], profile);
    const obs = out.deck[0]?.displayMetrics?.observationScore ?? 0;
    expect(obs).toBeGreaterThanOrEqual(0);
    expect(obs).toBeLessThanOrEqual(100);
    expect(out.deck[0]?.suitabilityAssessment).toBeDefined();
  });

  it("buildInvestorProfilePromptContext hides unspecified", () => {
    const s = buildInvestorProfilePromptContext(null, "missing");
    expect(s).toContain("미설정");
    expect(s).not.toMatch(/token|secret|password/i);
  });
});
