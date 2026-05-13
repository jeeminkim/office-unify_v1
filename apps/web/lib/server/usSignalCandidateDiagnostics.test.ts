import { describe, expect, it } from "vitest";
import type { TodayStockCandidate, UsMarketMorningSummary } from "@/lib/todayCandidatesContract";
import { buildUsKrEmptyThemeBridgeHint } from "./themeConnectionMap";
import { diagnoseUsKrSignalCandidates } from "./usSignalCandidateDiagnostics";

describe("diagnoseUsKrSignalCandidates", () => {
  it("flags usMarketDataMissing when yahoo empty", () => {
    const us: UsMarketMorningSummary = {
      asOfKst: "",
      available: false,
      conclusion: "no_data",
      summary: "",
      signals: [],
      warnings: ["us_market_quote_unavailable"],
      diagnostics: { yahooQuoteResultCount: 0, anchorSymbolsRequested: 10, fetchFailed: false },
    };
    const d = diagnoseUsKrSignalCandidates({ usMarketSummary: us, usMarketKrCandidates: [] });
    expect(d?.primaryReason).toBe("usMarketDataMissing");
    expect(d?.userMessage.length).toBeGreaterThan(10);
  });

  it("flags usToKrMappingEmpty when US ok but no KR candidates", () => {
    const us: UsMarketMorningSummary = {
      asOfKst: "",
      available: true,
      conclusion: "risk_on",
      summary: "",
      signals: [{ signalKey: "x", label: "L", direction: "positive", confidence: "low", evidence: [] }],
      warnings: [],
      diagnostics: { yahooQuoteResultCount: 8, anchorSymbolsRequested: 10, fetchFailed: false },
    };
    const d = diagnoseUsKrSignalCandidates({ usMarketSummary: us, usMarketKrCandidates: [] });
    expect(d?.reasonCodes).toContain("usToKrMappingEmpty");
  });

  it("returns undefined when KR candidates exist", () => {
    const us: UsMarketMorningSummary = {
      asOfKst: "",
      available: true,
      conclusion: "risk_on",
      summary: "",
      signals: [],
      warnings: [],
    };
    const kr: TodayStockCandidate[] = [
      {
        candidateId: "x",
        name: "N",
        market: "KOSPI",
        country: "KR",
        source: "us_market_morning",
        score: 50,
        confidence: "medium",
        riskLevel: "medium",
        reasonSummary: "",
        reasonDetails: [],
        positiveSignals: [],
        cautionNotes: [],
        relatedUserContext: [],
        relatedWatchlistSymbols: [],
        isBuyRecommendation: false,
      },
    ];
    expect(diagnoseUsKrSignalCandidates({ usMarketSummary: us, usMarketKrCandidates: kr })).toBeUndefined();
  });

  it("EVO-007: usToKrMappingEmpty plus weak theme map yields bridge hint", () => {
    const us: UsMarketMorningSummary = {
      asOfKst: "",
      available: true,
      conclusion: "risk_on",
      summary: "",
      signals: [{ signalKey: "x", label: "L", direction: "positive", confidence: "low", evidence: [] }],
      warnings: [],
      diagnostics: { yahooQuoteResultCount: 8, anchorSymbolsRequested: 10, fetchFailed: false },
    };
    const d = diagnoseUsKrSignalCandidates({ usMarketSummary: us, usMarketKrCandidates: [] });
    const hint = buildUsKrEmptyThemeBridgeHint({
      diagnostics: d,
      themeConnectionSummary: {
        mappedThemeCount: 0,
        linkedInstrumentCount: 0,
        confidenceCounts: { high: 0, medium: 0, low: 0, missing: 4 },
        missingThemeCount: 4,
      },
      themeConnectionMap: [{ themeKey: "ai_power_infra", themeLabel: "AI", linkedInstruments: [], confidence: "missing" }] as never,
    });
    expect(hint).toMatch(/한국 종목 연결/);
  });
});
