import { describe, expect, it } from "vitest";
import type { ResearchFollowupRowDto } from "@office-unify/shared-types";
import type { TodayStockCandidate } from "@/lib/todayCandidatesContract";
import {
  buildPbWeeklyReviewFromContext,
  buildRecommendedWeeklyReviewIdempotencyKey,
  sanitizeWeeklyReviewContext,
  stableStringifyForWeeklyReviewHash,
  weekOfMondayKstIso,
  type PrivateBankerWeeklyReviewContext,
} from "./privateBankerWeeklyReview";

function baseCtx(over: Partial<PrivateBankerWeeklyReviewContext> = {}): PrivateBankerWeeklyReviewContext {
  return {
    weekOf: "2026-05-11",
    userKey: "u-1",
    profileStatus: "missing",
    investorProfileTableMissing: true,
    primaryCandidateDeck: [],
    followupRows: [],
    followupTableMissing: false,
    nowIso: "2026-05-13T00:00:00.000Z",
    ...over,
  };
}

function minimalCandidate(over: Partial<TodayStockCandidate> = {}): TodayStockCandidate {
  return {
    candidateId: "c1",
    name: "TestCo",
    market: "KOSPI",
    country: "KR",
    symbol: "000001",
    source: "watchlist",
    score: 1,
    confidence: "high",
    riskLevel: "low",
    reasonSummary: "watch",
    reasonDetails: [],
    positiveSignals: [],
    cautionNotes: [],
    relatedUserContext: [],
    relatedWatchlistSymbols: [],
    isBuyRecommendation: false,
    ...over,
  };
}

describe("privateBankerWeeklyReview", () => {
  it("weekOfMondayKstIso anchors Monday in KST", () => {
    expect(weekOfMondayKstIso(new Date("2026-05-11T12:00:00+09:00"))).toBe("2026-05-11");
    expect(weekOfMondayKstIso(new Date("2026-05-17T12:00:00+09:00"))).toBe("2026-05-11");
  });

  it("profile missing fallback and caveat mentions non-recommendation", () => {
    const preview = buildPbWeeklyReviewFromContext(baseCtx(), Date.now());
    expect(preview.profileStatus).toBe("missing");
    expect(preview.qualityMeta.dataQuality).toBe("partial");
    expect(preview.caveat).toContain("매수 추천");
    expect(preview.caveat).toContain("자동 주문");
  });

  it("includes stale tracking follow-up and high-priority open in correct sections", () => {
    const old = new Date(Date.now() - 20 * 86400000).toISOString();
    const rows: ResearchFollowupRowDto[] = [
      {
        id: "fu-stale",
        user_key: "u-1",
        research_request_id: null,
        research_report_id: null,
        symbol: "AAA",
        company_name: null,
        title: "Stale track",
        detail_json: {},
        category: "other",
        priority: "medium",
        status: "tracking",
        selected_for_pb: false,
        pb_session_id: null,
        pb_turn_id: null,
        source: "x",
        created_at: old,
        updated_at: old,
      },
      {
        id: "fu-high",
        user_key: "u-1",
        research_request_id: null,
        research_report_id: null,
        symbol: "BBB",
        company_name: null,
        title: "High open",
        detail_json: {},
        category: "financials",
        priority: "high",
        status: "open",
        selected_for_pb: false,
        pb_session_id: null,
        pb_turn_id: null,
        source: "x",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    const preview = buildPbWeeklyReviewFromContext(baseCtx({ followupRows: rows, investorProfileTableMissing: false }), Date.now());
    expect(preview.qualityMeta.staleFollowupCount).toBe(1);
    expect(preview.sections.followups.some((x) => x.id === "followup:fu-stale")).toBe(true);
    expect(preview.sections.questions.some((x) => x.id === "followup_open_high:fu-high")).toBe(true);
  });

  it("includes concentration risk medium/high and score explanation summary", () => {
    const deck = [
      minimalCandidate({
        displayMetrics: {
          observationScore: 5,
          scoreLabel: "보통",
          confidenceLabel: "보통",
          dataQualityLabel: "ok",
          relationLabel: "r",
          scoreExplanation: "short",
          scoreExplanationDetail: {
            baseScore: 5,
            finalScore: 5,
            factors: [],
            summary: "요약 A — 관찰 점수 맥락",
            caveat: "c",
          },
        },
        concentrationRiskAssessment: {
          level: "high",
          reasonCodes: ["theme_overweight"],
          userMessage: "u",
          dataQuality: "ok",
        },
      }),
    ];
    const preview = buildPbWeeklyReviewFromContext(
      baseCtx({ primaryCandidateDeck: deck, investorProfileTableMissing: false, profileStatus: "complete" }),
      Date.now(),
    );
    expect(preview.qualityMeta.concentrationRiskCount).toBe(1);
    const cand = preview.sections.candidates.find((c) => c.type === "today_candidate");
    expect(cand?.summary).toContain("요약 A");
    const risk = preview.sections.risks.find((r) => r.type === "concentration_risk");
    expect(risk?.severity).toBe("caution");
  });

  it("sanitizeWeeklyReviewContext omits raw amounts and userNote-like detail_json", () => {
    const deck = [
      minimalCandidate({
        displayMetrics: {
          observationScore: 1,
          scoreLabel: "낮음",
          confidenceLabel: "낮음",
          dataQualityLabel: "x",
          relationLabel: "r",
          scoreExplanation: "s",
        },
      }),
    ];
    const ctx = baseCtx({
      primaryCandidateDeck: deck,
      followupRows: [
        {
          id: "f1",
          user_key: "u-1",
          research_request_id: null,
          research_report_id: null,
          symbol: "S",
          company_name: null,
          title: "T",
          detail_json: { userNote: "secret note", bullets: ["원 12,345,678 매수"] },
          category: "other",
          priority: "low",
          status: "open",
          selected_for_pb: false,
          pb_session_id: null,
          pb_turn_id: null,
          source: "x",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as ResearchFollowupRowDto,
      ],
    });
    const s = JSON.stringify(sanitizeWeeklyReviewContext(ctx));
    expect(s).not.toContain("12,345,678");
    expect(s).not.toContain("secret note");
    expect(s).not.toContain("userNote");
  });
});

describe("buildRecommendedWeeklyReviewIdempotencyKey", () => {
  it("is deterministic for same weekOf and sanitized payload", () => {
    const sanitized = { weekOf: "2026-05-11", profileStatus: "missing" } as Record<string, unknown>;
    const a = buildRecommendedWeeklyReviewIdempotencyKey("2026-05-11", sanitized);
    const b = buildRecommendedWeeklyReviewIdempotencyKey("2026-05-11", sanitized);
    expect(a).toBe(b);
    expect(a).toMatch(/^pb-weekly:2026-05-11:[a-f0-9]{24}$/);
  });

  it("changes when sanitized payload differs", () => {
    const k1 = buildRecommendedWeeklyReviewIdempotencyKey("2026-05-11", { a: 1 } as Record<string, unknown>);
    const k2 = buildRecommendedWeeklyReviewIdempotencyKey("2026-05-11", { a: 2 } as Record<string, unknown>);
    expect(k1).not.toBe(k2);
  });

  it("stableStringify sorts object keys for hash stability", () => {
    const a = stableStringifyForWeeklyReviewHash({ z: 1, m: 2 });
    const b = stableStringifyForWeeklyReviewHash({ m: 2, z: 1 });
    expect(a).toBe(b);
  });
});
