import { describe, expect, it } from "vitest";
import type { SectorRadarSummaryResponse } from "@/lib/sectorRadarContract";
import type { TodayStockCandidate, UsMarketMorningSummary } from "@/lib/todayCandidatesContract";
import { composeTodayBriefCandidates, buildSectorRadarEtfCandidate } from "./todayBriefCandidateComposer";
import { buildTodayCandidateDisplayMetrics } from "./todayBriefCandidateDisplay";
import { enrichPrimaryDeckWithThemeConnections } from "./themeConnectionMap";
import { diagnoseUsKrSignalCandidates } from "./usSignalCandidateDiagnostics";
import { enrichPrimaryCandidateDeckScoreExplanations } from "./todayBriefScoreExplanation";

const usSum = (available: boolean): UsMarketMorningSummary => ({
  asOfKst: new Date().toISOString(),
  available,
  conclusion: available ? "risk_on" : "no_data",
  summary: "t",
  signals: [],
  warnings: available ? [] : ["us_market_quote_unavailable"],
});

function interest(id: string, score: number): TodayStockCandidate {
  return {
    candidateId: id,
    name: "A",
    market: "KOSPI",
    country: "KR",
    source: "user_context",
    score,
    confidence: "medium",
    riskLevel: "medium",
    reasonSummary: "r",
    reasonDetails: [],
    positiveSignals: [],
    cautionNotes: [],
    relatedUserContext: [],
    relatedWatchlistSymbols: ["KR:000"],
    isBuyRecommendation: false,
  };
}

describe("composeTodayBriefCandidates", () => {
  it("picks top2 interest and one sector ETF with display metrics", () => {
    const radar: SectorRadarSummaryResponse = {
      ok: true,
      generatedAt: new Date().toISOString(),
      sectors: [
        {
          key: "s1",
          name: "AI/전력",
          score: 80,
          adjustedScore: 80,
          zone: "greed",
          actionHint: "hold",
          narrativeHint: "n",
          warnings: [],
          anchors: [
            {
              symbol: "SOXX",
              name: "SOXX ETF",
              googleTicker: "NASDAQ:SOXX",
              sourceLabel: "seed",
              dataStatus: "ok",
              etfDisplayGroup: "scored",
              etfQuoteQualityStatus: "ok",
              changePct: 1.2,
            },
          ],
          components: {},
        },
      ],
      warnings: [],
      fearCandidatesTop3: [],
      greedCandidatesTop3: [],
    };
    const out = composeTodayBriefCandidates({
      userContextCandidates: [interest("a", 50), interest("b", 60), interest("c", 40)],
      sectorRadarSummary: radar,
      usMarketSummary: usSum(true),
      usMarketKrCandidates: [],
    });
    expect(out.deck).toHaveLength(3);
    expect(out.deck.filter((x) => x.briefDeckSlot === "interest_stock")).toHaveLength(2);
    expect(out.deck.find((x) => x.briefDeckSlot === "sector_etf")).toBeTruthy();
    const dm = buildTodayCandidateDisplayMetrics(out.deck[0], { briefDeckSlot: "interest_stock" });
    expect(dm.observationScore).toBeGreaterThanOrEqual(0);
    expect(dm.scoreExplanation).not.toMatch(/우선순위/);
    expect(dm.scoreExplanation).not.toMatch(/priority/i);
    expect(out.deck.length).toBeLessThanOrEqual(3);
    const deckJson = JSON.stringify(out.deck);
    expect(deckJson).not.toMatch(/우선순위\s*60/);
    expect(deckJson).not.toMatch(/priority\s*60/i);
  });

  it("enrichPrimaryCandidateDeckScoreExplanations keeps legacy scoreExplanation and adds scoreExplanationDetail", () => {
    const radar: SectorRadarSummaryResponse = {
      ok: true,
      generatedAt: new Date().toISOString(),
      sectors: [
        {
          key: "s1",
          name: "AI/전력",
          score: 80,
          adjustedScore: 80,
          zone: "greed",
          actionHint: "hold",
          narrativeHint: "n",
          warnings: [],
          anchors: [
            {
              symbol: "SOXX",
              name: "SOXX ETF",
              googleTicker: "NASDAQ:SOXX",
              sourceLabel: "seed",
              dataStatus: "ok",
              etfDisplayGroup: "scored",
              etfQuoteQualityStatus: "ok",
              changePct: 1.2,
            },
          ],
          components: {},
        },
      ],
      warnings: [],
      fearCandidatesTop3: [],
      greedCandidatesTop3: [],
    };
    const out = composeTodayBriefCandidates({
      userContextCandidates: [interest("a", 50), interest("b", 60), interest("c", 40)],
      sectorRadarSummary: radar,
      usMarketSummary: usSum(true),
      usMarketKrCandidates: [],
    });
    const diag = diagnoseUsKrSignalCandidates({
      usMarketSummary: usSum(true),
      usMarketKrCandidates: [],
    });
    const enriched = enrichPrimaryCandidateDeckScoreExplanations(out.deck, {
      usKrSignalDiagnostics: diag ?? null,
      usMarketKrCount: 0,
    });
    expect(enriched[0]?.displayMetrics?.scoreExplanation).toMatch(/매수 권유가 아님|자동 주문이나 매수 권유/);
    expect(enriched[0]?.displayMetrics?.scoreExplanationDetail?.factors?.length).toBeGreaterThan(0);
    expect(enriched[0]?.displayMetrics?.scoreExplanationDetail?.finalScore).toBe(
      enriched[0]?.displayMetrics?.observationScore,
    );
  });

  it("EVO-007: theme enrich preserves deck length when usToKrMappingEmpty", () => {
    const radar: SectorRadarSummaryResponse = {
      ok: true,
      generatedAt: new Date().toISOString(),
      sectors: [
        {
          key: "s1",
          name: "AI/전력",
          score: 80,
          adjustedScore: 80,
          zone: "greed",
          actionHint: "hold",
          narrativeHint: "n",
          warnings: [],
          anchors: [
            {
              symbol: "SOXX",
              name: "SOXX ETF",
              googleTicker: "NASDAQ:SOXX",
              sourceLabel: "seed",
              dataStatus: "ok",
              etfDisplayGroup: "scored",
              etfQuoteQualityStatus: "ok",
              changePct: 1.2,
            },
          ],
          components: {},
        },
      ],
      warnings: [],
      fearCandidatesTop3: [],
      greedCandidatesTop3: [],
    };
    const out = composeTodayBriefCandidates({
      userContextCandidates: [interest("a", 50), interest("b", 60), interest("c", 40)],
      sectorRadarSummary: radar,
      usMarketSummary: {
        asOfKst: "",
        available: true,
        conclusion: "risk_on",
        summary: "",
        signals: [{ signalKey: "x", label: "L", direction: "positive", confidence: "low", evidence: [] }],
        warnings: [],
        diagnostics: { yahooQuoteResultCount: 8, anchorSymbolsRequested: 10, fetchFailed: false },
      },
      usMarketKrCandidates: [],
    });
    const diag = diagnoseUsKrSignalCandidates({
      usMarketSummary: {
        asOfKst: "",
        available: true,
        conclusion: "risk_on",
        summary: "",
        signals: [{ signalKey: "x", label: "L", direction: "positive", confidence: "low", evidence: [] }],
        warnings: [],
        diagnostics: { yahooQuoteResultCount: 8, anchorSymbolsRequested: 10, fetchFailed: false },
      },
      usMarketKrCandidates: [],
    });
    expect(diag?.primaryReason).toBe("usToKrMappingEmpty");
    const themed = enrichPrimaryDeckWithThemeConnections(out.deck, {
      sectorRadarSectors: radar.sectors as never,
      holdingRows: [],
      userContextCandidates: [interest("a", 50), interest("b", 60), interest("c", 40)],
      usMarketKrCandidates: [],
      usSignals: [{ label: "L", signalKey: "x" }],
      watchlistRows: [],
      watchlistSourceAvailable: false,
    });
    expect(themed.deck.length).toBe(out.deck.length);
  });

  it("falls back to interest top3 when no ETF", () => {
    const out = composeTodayBriefCandidates({
      userContextCandidates: [interest("a", 55), interest("b", 54), interest("c", 53)],
      sectorRadarSummary: { ok: true, generatedAt: "", sectors: [], warnings: [], fearCandidatesTop3: [], greedCandidatesTop3: [] },
      usMarketSummary: usSum(true),
      usMarketKrCandidates: [],
    });
    expect(out.deck).toHaveLength(3);
    expect(out.qualityMeta.fallbackReason).toBeDefined();
  });
});

describe("buildSectorRadarEtfCandidate", () => {
  it("marks sector etf slot", () => {
    const c = buildSectorRadarEtfCandidate({
      sector: {
        key: "k",
        name: "T",
        zone: "neutral",
        actionHint: "hold",
        narrativeHint: "n",
        score: 70,
        warnings: [],
        anchors: [],
        components: {},
      },
      anchor: {
        symbol: "X",
        name: "X ETF",
        googleTicker: "US:X",
        sourceLabel: "seed",
        dataStatus: "ok",
        etfQuoteQualityStatus: "ok",
      },
    });
    expect(c.source).toBe("sector_radar");
    expect(c.briefDeckSlot).toBe("sector_etf");
  });
});
