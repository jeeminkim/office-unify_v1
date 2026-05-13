import { describe, expect, it } from "vitest";
import { buildConcentrationRiskCardHint, type InvestorProfile } from "@office-unify/shared-types";
import type { TodayStockCandidate } from "@/lib/todayCandidatesContract";
import type { WebPortfolioHoldingRow } from "@office-unify/supabase-access";
import {
  applyConcentrationRiskToPrimaryDeck,
  assessConcentrationRiskForCandidate,
  buildConcentrationRiskPromptSection,
  buildPortfolioExposureSnapshotFromHoldingsRows,
  buildTodayBriefConcentrationRiskSummary,
  thresholdsForConcentrationLimit,
} from "./concentrationRisk";

function h(
  market: string,
  symbol: string,
  sector: string | null,
  qty: number,
  avg: number,
): WebPortfolioHoldingRow {
  return {
    market,
    symbol,
    name: symbol,
    google_ticker: null,
    quote_symbol: null,
    sector,
    investment_memo: null,
    qty,
    avg_price: avg,
    target_price: null,
    judgment_memo: null,
  };
}

function cand(partial: Partial<TodayStockCandidate>): TodayStockCandidate {
  return {
    candidateId: "c1",
    name: "T",
    market: "KOSPI",
    country: "KR",
    stockCode: "005930",
    source: "user_context",
    score: 50,
    confidence: "medium",
    riskLevel: "medium",
    reasonSummary: "r",
    reasonDetails: [],
    positiveSignals: [],
    cautionNotes: [],
    relatedUserContext: [],
    relatedWatchlistSymbols: [],
    isBuyRecommendation: false,
    sector: "반도체",
    ...partial,
  };
}

describe("thresholdsForConcentrationLimit", () => {
  it("strict is tighter than flexible", () => {
    const s = thresholdsForConcentrationLimit("strict");
    const f = thresholdsForConcentrationLimit("flexible");
    expect(s.single).toBeLessThan(f.single);
    expect(s.theme).toBeLessThan(f.theme);
  });

  it("unknown maps to moderate defaults", () => {
    const u = thresholdsForConcentrationLimit("unknown");
    const m = thresholdsForConcentrationLimit("moderate");
    expect(u).toEqual(m);
  });
});

describe("buildPortfolioExposureSnapshotFromHoldingsRows", () => {
  it("returns missing when no holdings", () => {
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows([], 0, true);
    expect(snap.dataQuality).toBe("missing");
    expect(snap.holdingCount).toBe(0);
  });

  it("returns market_value_missing shape when total is zero", () => {
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows([{ h: h("KR", "1", "a", 1, 0), value: 0 }], 0, true);
    expect(snap.totalValue).toBe(0);
    expect(snap.holdingCount).toBeGreaterThan(0);
  });

  it("marks partial when quotes missing", () => {
    const rows = [{ h: h("KR", "005930", "반도체", 10, 50000), value: 500000, valueSource: "cost_basis" }];
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows(rows, 500000, false);
    expect(snap.dataQuality).toBe("partial");
    expect(snap.symbolWeightPct["KR:005930"]).toBeCloseTo(100, 5);
    expect(snap.exposureBasis).toBe("cost_basis");
  });

  it("exposureBasis market_value when all rows use quote-based values", () => {
    const rows = [
      { h: h("KR", "1", "a", 1, 1), value: 10, valueSource: "market_value" as const },
      { h: h("KR", "2", "b", 1, 1), value: 20, valueSource: "market_value" as const },
    ];
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows(rows, 30, true);
    expect(snap.exposureBasis).toBe("market_value");
  });

  it("exposureBasis mixed when valueSource differs across rows", () => {
    const rows = [
      { h: h("KR", "1", "a", 1, 1), value: 10, valueSource: "market_value" as const },
      { h: h("KR", "2", "b", 1, 1), value: 20, valueSource: "cost_basis" as const },
    ];
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows(rows, 30, true);
    expect(snap.exposureBasis).toBe("mixed");
  });

  it("exposureBasis unknown for empty rows (holdingCount 0)", () => {
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows([], 0, true);
    expect(snap.exposureBasis).toBe("unknown");
  });
});

describe("assessConcentrationRiskForCandidate", () => {
  const profileModerate: InvestorProfile = {
    riskTolerance: "medium",
    timeHorizon: "mid",
    leveragePolicy: "limited",
    concentrationLimit: "moderate",
  };

  it("holdings missing", () => {
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows([], 0, true);
    const a = assessConcentrationRiskForCandidate(cand({}), profileModerate, snap);
    expect(a.reasonCodes).toContain("holdings_missing");
    expect(a.level).toBe("none");
  });

  it("single symbol overweight vs threshold", () => {
    const rows = [
      { h: h("KR", "005930", "반도체", 100, 1000), value: 100000, valueSource: "market_value" },
      { h: h("KR", "000660", "반도체", 1, 1000), value: 1000, valueSource: "market_value" },
    ];
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows(rows, 101000, true);
    const a = assessConcentrationRiskForCandidate(cand({ stockCode: "005930" }), profileModerate, snap);
    expect(a.reasonCodes).toContain("single_symbol_overweight");
    expect(["medium", "high", "low"]).toContain(a.level);
  });

  it("theme overlap", () => {
    const rows = [
      { h: h("KR", "005930", "반도체", 10, 10000), value: 400000, valueSource: "market_value" },
      { h: h("KR", "000660", "반도체", 10, 10000), value: 400000, valueSource: "market_value" },
    ];
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows(rows, 800000, true);
    const a = assessConcentrationRiskForCandidate(cand({ sector: "반도체", stockCode: "012345" }), profileModerate, snap);
    expect(a.reasonCodes.some((r) => r === "theme_overweight" || r === "sector_overweight")).toBe(true);
  });

  it("strict adds profile_limit_strict when over threshold band", () => {
    const rows = [{ h: h("KR", "005930", "반도체", 100, 1000), value: 100000, valueSource: "market_value" }];
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows(rows, 100000, true);
    const strict: InvestorProfile = { ...profileModerate, concentrationLimit: "strict" };
    const a = assessConcentrationRiskForCandidate(cand({ stockCode: "005930" }), strict, snap);
    expect(a.reasonCodes).toContain("profile_limit_strict");
  });

  it("profile missing minimizes warnings when no overlap", () => {
    const rows = [{ h: h("KR", "000660", "2차전지", 1, 1000), value: 1000, valueSource: "market_value" }];
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows(rows, 1000, true);
    const a = assessConcentrationRiskForCandidate(
      cand({ stockCode: "AAPL", sector: "인터넷", country: "US", market: "US" }),
      null,
      snap,
    );
    expect(a.level).toBe("none");
    expect(a.reasonCodes.length).toBe(0);
  });

  it("userMessage is not a buy/sell order", () => {
    const rows = [{ h: h("KR", "005930", "반도체", 100, 1000), value: 100000, valueSource: "market_value" }];
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows(rows, 100000, true);
    const a = assessConcentrationRiskForCandidate(cand({ stockCode: "005930" }), profileModerate, snap);
    expect(a.userMessage).not.toMatch(/매수하라|매도하라|매도하세요|비중을\s*줄|리밸런싱하세요|제외하세요|전량|리밸런싱\s*실행/i);
    expect(a.userMessage).toMatch(/참고|점검|아닙니다/);
    expect(a.exposureBasis).toBe("market_value");
  });

  it("themeMappingConfidence high when explicit theme hint matches bucket", () => {
    const rows = [{ h: h("KR", "005930", "반도체", 10, 1), value: 100, valueSource: "market_value" }];
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows(rows, 100, true);
    const a = assessConcentrationRiskForCandidate(
      cand({ sector: "기타", sectorEtfThemeHint: "반도체", stockCode: "099999" }),
      profileModerate,
      snap,
    );
    expect(a.themeMappingConfidence).toBe("high");
  });

  it("themeMappingConfidence medium when sector string matches bucket without hint", () => {
    const rows = [{ h: h("KR", "005930", "반도체", 10, 1), value: 100, valueSource: "market_value" }];
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows(rows, 100, true);
    const a = assessConcentrationRiskForCandidate(cand({ sector: "반도체", stockCode: "099999" }), profileModerate, snap);
    expect(a.themeMappingConfidence).toBe("medium");
  });

  it("themeMappingConfidence low when only partial label overlap", () => {
    const rows = [{ h: h("KR", "005930", "반도체", 10, 1), value: 100, valueSource: "market_value" }];
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows(rows, 100, true);
    const a = assessConcentrationRiskForCandidate(
      cand({ sector: "반도체장비", stockCode: "099999" }),
      profileModerate,
      snap,
    );
    expect(a.themeMappingConfidence).toBe("low");
  });

  it("EVO-007: themeConnection high upgrades themeMappingConfidence when heuristic was weaker", () => {
    const rows = [{ h: h("KR", "005930", "금융", 10, 1), value: 100, valueSource: "market_value" }];
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows(rows, 100, true);
    const a = assessConcentrationRiskForCandidate(
      cand({
        sector: "기타",
        stockCode: "099999",
        themeConnection: {
          themeKey: "ai_power_infra",
          themeLabel: "AI/전력 인프라",
          confidence: "high",
          reason: "Sector Radar와 registry 키 일치(테스트)",
        },
      }),
      profileModerate,
      snap,
    );
    expect(a.themeMappingConfidence).toBe("high");
  });

  it("country_overweight message clarifies KR/US market exposure heuristic", () => {
    const rows = [
      { h: h("US", "QQQ", "기술", 1, 1), value: 90, valueSource: "market_value" },
      { h: h("KR", "005930", "반도체", 1, 1), value: 10, valueSource: "market_value" },
    ];
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows(rows, 100, true);
    const a = assessConcentrationRiskForCandidate(cand({ country: "US", market: "US", stockCode: "MSFT" }), profileModerate, snap);
    expect(a.reasonCodes).toContain("country_overweight");
    expect(a.userMessage).toMatch(/시장 노출|KR·US/);
  });
});

describe("applyConcentrationRiskToPrimaryDeck", () => {
  it("adds concentrationRiskAssessment to deck items", () => {
    const rows = [{ h: h("KR", "005930", "반도체", 100, 1000), value: 100000, valueSource: "market_value" }];
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows(rows, 100000, true);
    const deck = [cand({ stockCode: "005930", score: 80 })];
    const out = applyConcentrationRiskToPrimaryDeck(deck, null, snap);
    expect(out[0]?.concentrationRiskAssessment).toBeDefined();
  });
});

describe("buildTodayBriefConcentrationRiskSummary", () => {
  it("counts assessed deck size", () => {
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows(
      [{ h: h("KR", "005930", "반도체", 100, 1000), value: 100000, valueSource: "market_value" }],
      100000,
      true,
    );
    const strictProfile: InvestorProfile = {
      riskTolerance: "medium",
      timeHorizon: "mid",
      leveragePolicy: "limited",
      concentrationLimit: "strict",
    };
    const deck = applyConcentrationRiskToPrimaryDeck(
      [cand({ candidateId: "1", stockCode: "005930" }), cand({ candidateId: "2", stockCode: "999999", sector: "조선" })],
      strictProfile,
      snap,
    );
    const s = buildTodayBriefConcentrationRiskSummary(deck, snap);
    expect(s.assessedCandidateCount).toBe(2);
    expect(typeof s.highRiskCount).toBe("number");
    expect(typeof s.mediumRiskCount).toBe("number");
    expect(s.exposureBasis).toBe("market_value");
    expect(s.themeMappingConfidenceCounts).toBeDefined();
    expect(JSON.stringify(s)).not.toMatch(/매도하세요|리밸런싱하세요|비중을\s*줄/);
  });
});

describe("buildConcentrationRiskPromptSection", () => {
  it("includes concentration header, data basis, questions, and no sell/rebalance orders", () => {
    const snap = buildPortfolioExposureSnapshotFromHoldingsRows(
      [{ h: h("KR", "005930", "반도체", 1, 1), value: 1, valueSource: "market_value" }],
      1,
      true,
    );
    const p = buildConcentrationRiskPromptSection(null, snap);
    expect(p).toContain("[보유 집중도 점검]");
    expect(p).toMatch(/데이터 기준/);
    expect(p).toMatch(/KR\/US 시장 노출/);
    expect(p).toMatch(/자동매매.*금지/);
    expect(p).not.toMatch(/매도하세요|비중을\s*줄이세요|리밸런싱하세요|제외하세요/i);
    expect(p).toMatch(/질문/);
  });
});

describe("buildConcentrationRiskCardHint (shared-types)", () => {
  it("card hints avoid imperative sell/rebalance phrasing", () => {
    const forbid = /매도하세요|비중을\s*줄|리밸런싱하세요|제외하세요/i;
    expect(buildConcentrationRiskCardHint({ level: "high", reasonCodes: [], userMessage: "", dataQuality: "ok" })).not.toMatch(
      forbid,
    );
    expect(buildConcentrationRiskCardHint({ level: "medium", reasonCodes: [], userMessage: "", dataQuality: "ok" })).not.toMatch(
      forbid,
    );
    expect(buildConcentrationRiskCardHint({ level: "low", reasonCodes: [], userMessage: "", dataQuality: "ok" })).not.toMatch(
      forbid,
    );
  });
});
