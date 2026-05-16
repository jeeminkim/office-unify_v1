import { describe, expect, it } from "vitest";
import { resolveCorporateActionRiskForStockCode } from "./corporateActionRiskRegistry";
import {
  applyCorporateActionRiskGate,
  applyRepeatExposurePenaltiesToDeck,
  repeatExposurePenaltyFromStat,
} from "./todayCandidateScoring";
import type { TodayStockCandidate } from "@/lib/todayCandidatesContract";
import { buildTodayCandidatesUsMarketNoDataFingerprint } from "./opsAggregateWarnings";

function stubCandidate(over: Partial<TodayStockCandidate>): TodayStockCandidate {
  return {
    candidateId: "stub",
    name: "Stub",
    market: "KOSPI",
    country: "KR",
    source: "user_context",
    score: 72,
    confidence: "medium",
    riskLevel: "medium",
    reasonSummary: "관찰",
    reasonDetails: [],
    positiveSignals: [],
    cautionNotes: [],
    relatedUserContext: [],
    relatedWatchlistSymbols: [],
    isBuyRecommendation: false,
    stockCode: "028300",
    ...over,
  };
}

describe("today brief harness — corporate action & repeat score", () => {
  it("registry HLB example activates corporate risk", () => {
    const snap = resolveCorporateActionRiskForStockCode("028300");
    expect(snap?.active).toBe(true);
    expect(snap?.riskType).toBe("rights_offering");
  });

  it("corporate gate caps final score at 50 and sets review action", () => {
    const snap = resolveCorporateActionRiskForStockCode("028300");
    expect(snap).toBeTruthy();
    let c = stubCandidate({
      score: 72,
      corporateActionRisk: snap,
      scoreBreakdown: {
        baseScore: 52,
        watchlistBoost: 20,
        sectorBoost: 0,
        usSignalBoost: 0,
        quoteQualityPenalty: 0,
        repeatExposurePenalty: 0,
        corporateActionPenalty: 0,
        riskPenalty: 0,
        finalScore: 72,
      },
    });
    c = applyCorporateActionRiskGate(c);
    expect(c.score).toBeLessThanOrEqual(50);
    expect(c.candidateAction).toBe("review_required");
    expect(c.dataQuality?.primaryRisk?.code).toBe("corporate_event_risk");
  });

  it("repeat exposure penalty applies for high 7d counts", () => {
    const pen = repeatExposurePenaltyFromStat({
      candidateRepeatCount7d: 10,
      lastShownAt: null,
      source: "exposed_event",
    });
    expect(pen).toBeGreaterThan(0);
  });

  it("applyRepeatExposurePenaltiesToDeck adjusts score and breakdown", () => {
    const deck = [
      stubCandidate({
        candidateId: "a",
        score: 60,
        scoreBreakdown: {
          baseScore: 60,
          watchlistBoost: 0,
          sectorBoost: 0,
          usSignalBoost: 0,
          quoteQualityPenalty: 0,
          repeatExposurePenalty: 0,
          corporateActionPenalty: 0,
          riskPenalty: 0,
          finalScore: 60,
        },
        displayMetrics: {
          observationScore: 60,
          scoreLabel: "보통",
          confidenceLabel: "보통",
          dataQualityLabel: "ok",
          relationLabel: "test",
          scoreExplanation: "test",
        },
      }),
    ];
    const m = new Map([
      ["a", { candidateRepeatCount7d: 8, lastShownAt: null, source: "exposed_event" as const }],
    ]);
    const next = applyRepeatExposurePenaltiesToDeck(deck, m);
    expect(next[0].score).toBeLessThan(deck[0].score);
    expect((next[0].scoreBreakdown?.repeatExposurePenalty ?? 0) > 0).toBe(true);
  });

  it("us market no-data fingerprint includes empty reason slug", () => {
    const fp = buildTodayCandidatesUsMarketNoDataFingerprint({
      userKey: "u1",
      ymdKst: "20260516",
      emptyReasonSlug: "upstream_empty_result",
    });
    expect(fp).toContain("us_market_no_data:upstream_empty_result");
  });
});
