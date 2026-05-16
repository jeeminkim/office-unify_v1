import { describe, expect, it } from "vitest";
import type { TodayBriefWithCandidatesResponse } from "@/lib/todayCandidatesContract";
import type { TodayStockCandidate } from "@/lib/todayCandidatesContract";
import { resolveCorporateActionRiskForStockCode } from "@/lib/server/corporateActionRiskRegistry";
import {
  applyCorporateActionRiskGate,
  applyRepeatExposurePenaltiesToDeck,
} from "@/lib/server/todayCandidateScoring";

/** 회귀: 클라이언트/브리핑이 기대하는 최소 키가 제거되지 않았는지 고정(값은 픽스처 수준). */
const LEGACY_DECK_KEYS: (keyof TodayStockCandidate)[] = [
  "candidateId",
  "name",
  "market",
  "score",
  "confidence",
  "reasonSummary",
  "isBuyRecommendation",
  "reasonDetails",
  "positiveSignals",
  "cautionNotes",
];

function minimalDeckCandidate(): TodayStockCandidate {
  return {
    candidateId: "reg-1",
    name: "테스트",
    market: "KOSPI",
    country: "KR",
    source: "user_context",
    score: 55,
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
  };
}

describe("Today Brief / Today Candidates contract regression", () => {
  it("preserves legacy candidate deck keys on a minimal candidate object", () => {
    const c = minimalDeckCandidate();
    for (const k of LEGACY_DECK_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(c, k)).toBe(true);
    }
    expect(c.isBuyRecommendation).toBe(false);
  });

  it("additive fields may exist without breaking type: scoreBreakdown, corporateActionRisk, candidateAction", () => {
    const c = minimalDeckCandidate();
    const withAdditive: TodayStockCandidate = {
      ...c,
      scoreBreakdown: {
        baseScore: 50,
        watchlistBoost: 5,
        sectorBoost: 0,
        usSignalBoost: 0,
        quoteQualityPenalty: 0,
        repeatExposurePenalty: 0,
        corporateActionPenalty: 0,
        riskPenalty: 0,
        finalScore: 55,
      },
      candidateAction: "review_required",
      corporateActionRisk: resolveCorporateActionRiskForStockCode("028300"),
    };
    expect(withAdditive.scoreBreakdown?.finalScore).toBe(55);
    expect(withAdditive.corporateActionRisk?.active).toBe(true);
  });

  it("HLB corporate gate: score <= 50, review/observe action, primaryRisk corporate_event_risk, no 신규 진입 추천 문구", () => {
    const snap = resolveCorporateActionRiskForStockCode("028300");
    expect(snap?.active).toBe(true);
    let c = minimalDeckCandidate();
    c = {
      ...c,
      reasonSummary: "신규 진입 후보로 보입니다",
      corporateActionRisk: snap,
      scoreBreakdown: {
        baseScore: 48,
        watchlistBoost: 20,
        sectorBoost: 0,
        usSignalBoost: 0,
        quoteQualityPenalty: 0,
        repeatExposurePenalty: 0,
        corporateActionPenalty: 0,
        riskPenalty: 0,
        finalScore: 68,
      },
    };
    c = applyCorporateActionRiskGate(c);
    expect(c.score).toBeLessThanOrEqual(50);
    expect(c.candidateAction === "review_required" || c.candidateAction === "observe_only").toBe(true);
    expect(c.dataQuality?.primaryRisk?.code).toBe("corporate_event_risk");
    expect(c.reasonSummary).not.toMatch(/신규 진입 후보/);
    expect(c.reasonSummary).toMatch(/리스크 점검/);
  });

  it("qualityMeta.todayCandidates.usCoverage degraded shape (additive)", () => {
    const brief: Pick<TodayBriefWithCandidatesResponse, "qualityMeta"> = {
      qualityMeta: {
        todayCandidates: {
          generatedAt: new Date().toISOString(),
          userContextCount: 0,
          usMarketKrCount: 0,
          usMarketDataAvailable: false,
          warnings: [],
          usCoverage: {
            status: "degraded",
            message: "미국 시세 요약을 불완전하게 불러왔습니다.",
          },
        },
      },
    };
    expect(brief.qualityMeta?.todayCandidates?.usCoverage?.status).toBe("degraded");
  });

  it("repeatExposurePenalty lowers finalScore vs baseline in deck helper", () => {
    const deck = [
      minimalDeckCandidate(),
    ];
    deck[0].candidateId = "rep";
    deck[0].scoreBreakdown = {
      baseScore: 58,
      watchlistBoost: 0,
      sectorBoost: 0,
      usSignalBoost: 0,
      quoteQualityPenalty: 0,
      repeatExposurePenalty: 0,
      corporateActionPenalty: 0,
      riskPenalty: 0,
      finalScore: 58,
    };
    deck[0].score = 58;
    deck[0].displayMetrics = {
      observationScore: 58,
      scoreLabel: "보통",
      confidenceLabel: "보통",
      dataQualityLabel: "ok",
      relationLabel: "test",
      scoreExplanation: "test",
    };
    const stat = new Map([
      ["rep", { candidateRepeatCount7d: 10, lastShownAt: null, source: "exposed_event" as const }],
    ]);
    const next = applyRepeatExposurePenaltiesToDeck(deck, stat);
    expect(next[0].score!).toBeLessThan(deck[0].score!);
    expect((next[0].scoreBreakdown?.repeatExposurePenalty ?? 0) > 0).toBe(true);
  });

  it("additive: judgmentQuality + decisionTrace optional fields do not replace legacy keys", () => {
    const c = minimalDeckCandidate();
    const extended = {
      ...c,
      decisionTrace: { decisionStatus: "selected" as const, candidateBucket: "watchlist" as const, selectedReasons: [], suppressedReasons: [], rejectedReasons: [], downgradeReasons: [], missingEvidence: [], dataQualityFlags: [], riskFlags: [], nextChecks: [], doNotDo: [] },
      judgmentQuality: { score: 50, level: "medium" as const, reasons: [], penalties: [] },
    };
    expect(extended.score).toBe(55);
    expect(extended.judgmentQuality?.level).toBe("medium");
  });
});
