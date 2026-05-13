import { describe, expect, it } from "vitest";
import type { PbWeeklyReview, ResearchFollowupRowDto } from "@office-unify/shared-types";
import {
  buildDecisionRetroSeedFromFollowup,
  buildDecisionRetroSeedFromPbWeeklyReview,
  buildDecisionRetroSeedFromTodayCandidate,
  computeDecisionRetrospectivesQualityMeta,
  DECISION_RETRO_STALE_DRAFT_DAYS,
  parseDecisionRetroQualitySignals,
} from "@/lib/server/decisionRetrospective";
import { DECISION_RETRO_TEXT_FIELD_MAX, sanitizeDecisionRetroInput, stripDecisionRetroControlChars } from "@/lib/server/decisionRetrospectiveSanitize";
import type { TodayStockCandidate } from "@/lib/todayCandidatesContract";

function samplePbReview(): PbWeeklyReview {
  return {
    weekOf: "2026-05-11",
    profileStatus: "partial",
    sections: {
      candidates: [{ id: "c1", type: "today_candidate", title: "A", summary: "s", severity: "info", actionQuestion: "q?" }],
      followups: [{ id: "f1", type: "followup", title: "F", summary: "x", severity: "watch", actionQuestion: "qf?" }],
      risks: [{ id: "r1", type: "concentration_risk", title: "R", summary: "y", severity: "caution", actionQuestion: "qr?" }],
      questions: [{ id: "q1", type: "today_candidate", title: "Q1", summary: "z", severity: "info", actionQuestion: "qq?" }],
    },
    caveat: "caveat",
    qualityMeta: {
      todayCandidateCount: 1,
      staleFollowupCount: 0,
      concentrationRiskCount: 1,
      suitabilityWarningCount: 0,
      dataQuality: "ok",
    },
  };
}

describe("decisionRetrospective seeds", () => {
  it("buildDecisionRetroSeedFromFollowup avoids userNote raw and caps bullets", () => {
    const row: ResearchFollowupRowDto = {
      id: "fu-1",
      user_key: "u",
      research_request_id: null,
      research_report_id: null,
      symbol: "005930",
      company_name: "Sam",
      title: "Check supply",
      detail_json: {
        bullets: ["a".repeat(200), "b".repeat(200), "c"],
        userNote: "SECRET " + "x".repeat(5000),
      },
      category: "pipeline",
      priority: "high",
      status: "tracking",
      selected_for_pb: false,
      pb_session_id: null,
      pb_turn_id: null,
      source: "research_center",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const seed = buildDecisionRetroSeedFromFollowup(row, new Date("2026-02-20T00:00:00.000Z").getTime());
    expect(seed.summary).not.toContain("SECRET");
    expect(seed.summary).toMatch(/메모 있음/);
    expect(seed.detailJson.hasUserNote).toBe(true);
    expect(seed.summary).not.toContain("x".repeat(100));
  });

  it("buildDecisionRetroSeedFromPbWeeklyReview does not embed long PB reply", () => {
    const review = samplePbReview();
    const seed = buildDecisionRetroSeedFromPbWeeklyReview(review);
    expect(seed.title).toContain("2026-05-11");
    expect(JSON.stringify(seed.detailJson)).not.toContain("assistant");
    expect(seed.summary.length).toBeLessThanOrEqual(500);
  });

  it("buildDecisionRetroSeedFromTodayCandidate summarizes codes not amounts", () => {
    const c: TodayStockCandidate = {
      candidateId: "cid-1",
      name: "TestCo",
      market: "KOSPI",
      country: "KR",
      symbol: "000001",
      source: "user_context",
      score: 50,
      confidence: "medium",
      riskLevel: "medium",
      reasonSummary: "테스트 요약",
      reasonDetails: [],
      positiveSignals: [],
      cautionNotes: [],
      relatedUserContext: [],
      relatedWatchlistSymbols: [],
      isBuyRecommendation: false,
      displayMetrics: {
        observationScore: 55,
        scoreLabel: "보통",
        confidenceLabel: "보통",
        dataQualityLabel: "ok",
        relationLabel: "x",
        scoreExplanation: "expl",
        scoreExplanationDetail: {
          finalScore: 55,
          factors: [{ code: "quote_quality", label: "L", direction: "neutral", message: "m" }],
          summary: "s",
          caveat: "c",
        },
      },
      suitabilityAssessment: {
        profileStatus: "complete",
        scoreAdjustment: 0,
        warningCodes: ["high_volatility_for_low_risk"],
        userMessage: "u",
      },
      concentrationRiskAssessment: {
        level: "medium",
        reasonCodes: ["theme_overweight"],
        userMessage: "u2",
        dataQuality: "partial",
        themeMappingConfidence: "low",
      },
    };
    const seed = buildDecisionRetroSeedFromTodayCandidate(c);
    expect(seed.summary).toContain("quote_quality");
    expect(seed.summary).not.toMatch(/[₩$]\s*\d/);
    expect(seed.detailJson.candidateId).toBe("cid-1");
  });
});

describe("sanitizeDecisionRetroInput", () => {
  it("strips control chars and truncates", () => {
    const long = "a".repeat(DECISION_RETRO_TEXT_FIELD_MAX + 50);
    const out = sanitizeDecisionRetroInput({
      whatWorked: "ok\u0001x",
      nextRule: long,
    });
    expect(out.whatWorked).toBe("okx");
    expect(out.nextRule?.length).toBeLessThanOrEqual(DECISION_RETRO_TEXT_FIELD_MAX);
  });

  it("stripDecisionRetroControlChars keeps newline", () => {
    expect(stripDecisionRetroControlChars("a\nb")).toBe("a\nb");
  });
});

describe("computeDecisionRetrospectivesQualityMeta", () => {
  it("counts stale drafts and learned", () => {
    const old = new Date("2025-01-01T00:00:00.000Z").toISOString();
    const now = new Date("2026-06-15T00:00:00.000Z").getTime();
    const staleThresholdMs = DECISION_RETRO_STALE_DRAFT_DAYS * 24 * 60 * 60 * 1000;
    expect(now - new Date(old).getTime()).toBeGreaterThan(staleThresholdMs);
    const rows = [
      { status: "draft", outcome: "unknown", quality_signals: ["unknown"], created_at: old },
      { status: "learned", outcome: "helpful", quality_signals: ["pb_question_useful"], created_at: old },
      { status: "draft", outcome: "unknown", quality_signals: [], created_at: new Date("2026-06-14T00:00:00.000Z").toISOString() },
    ];
    const m = computeDecisionRetrospectivesQualityMeta(rows, now);
    expect(m.totalCount).toBe(3);
    expect(m.staleDraftCount).toBe(1);
    expect(m.learnedCount).toBe(1);
    expect(m.outcomeCounts.helpful).toBe(1);
    expect(m.qualitySignalCounts.pb_question_useful).toBe(1);
  });
});

describe("parseDecisionRetroQualitySignals", () => {
  it("rejects unknown token", () => {
    expect(parseDecisionRetroQualitySignals(["risk_warning_useful", "nope"])).toBeNull();
  });
});
