import { describe, expect, it } from "vitest";
import type { SectorRadarSummaryResponse } from "@/lib/sectorRadarContract";
import type { TodayStockCandidate, UsMarketMorningSummary } from "@/lib/todayCandidatesContract";
import {
  buildCandidateDeckContractDiagnostics,
  composeTodayBriefCandidates,
  buildSectorRadarEtfCandidate,
} from "./todayBriefCandidateComposer";
import type { TodayStockCandidate } from "@/lib/todayCandidatesContract";
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

function usCandidate(id: string): TodayStockCandidate {
  return {
    candidateId: id,
    name: "Tesla",
    market: "US",
    country: "US",
    symbol: "TSLA",
    source: "us_market",
    score: 55,
    confidence: "medium",
    riskLevel: "medium",
    reasonSummary: "US signal",
    reasonDetails: [],
    positiveSignals: [],
    cautionNotes: [],
    relatedUserContext: [],
    relatedWatchlistSymbols: [],
    isBuyRecommendation: false,
    briefDeckSlot: "us_market_check",
  };
}

describe("composeTodayBriefCandidates", () => {
  it("reports deck contract ok when 2 KR plus 1 US are filled", () => {
    const contract = buildCandidateDeckContractDiagnostics({
      primaryDeck: [interest("kr1", 80), interest("kr2", 70), usCandidate("us1")],
      diagnosticCandidateCards: [],
      usPoolCount: 1,
      usSignalCandidateCount: 0,
    });
    expect(contract.deckContractStatus).toBe("ok");
    expect(contract.filledKrSlots).toBe(2);
    expect(contract.filledUsSlots).toBe(1);
  });

  it("uses a US diagnostic slot instead of forcing a US candidate", () => {
    const diagnostic = {
      ...usCandidate("us-diagnostic"),
      reasonDetails: ["us_signal_mapping_empty"],
      displayMetrics: { candidateCardKind: "us_data_check" },
    } as TodayStockCandidate;
    const contract = buildCandidateDeckContractDiagnostics({
      primaryDeck: [interest("kr1", 80), interest("kr2", 70)],
      diagnosticCandidateCards: [diagnostic],
      usPoolCount: 0,
      usSignalCandidateCount: 0,
    });
    expect(contract.deckContractStatus).toBe("partial");
    expect(contract.usDiagnosticSlotPresent).toBe(true);
    expect(contract.usSlotFallbackReason).toBe("us_signal_mapping_empty");
    expect(contract.actionHint).toContain("강제로 만들지 않고");
  });

  it("marks KR slot shortage as partial/degraded with reason", () => {
    const contract = buildCandidateDeckContractDiagnostics({
      primaryDeck: [interest("kr1", 80)],
      diagnosticCandidateCards: [],
      usPoolCount: 0,
      usSignalCandidateCount: 0,
    });
    expect(contract.krSlotFallbackReason).toBe("insufficient_kr_candidates");
    expect(contract.deckContractStatus).toBe("degraded");
  });

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
    expect(dm.scoreExplanation).toContain("관찰 우선순위");
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
    expect(enriched[0]?.displayMetrics?.scoreExplanation).toMatch(/자동 주문이나 매수 추천이 아닙니다|매수 권유가 아님/);
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

  it("routes TSLA to diagnostic cards when US market data is empty", () => {
    const tsla: TodayStockCandidate = {
      candidateId: "us-direct-watchlist-TSLA",
      name: "테슬라",
      market: "US",
      country: "US",
      symbol: "US:TSLA",
      source: "watchlist",
      score: 65,
      confidence: "low",
      riskLevel: "medium",
      reasonSummary: "미국 관심",
      reasonDetails: [],
      positiveSignals: [],
      cautionNotes: [],
      relatedUserContext: [],
      relatedWatchlistSymbols: ["US:TSLA"],
      isBuyRecommendation: false,
      alreadyInWatchlist: true,
    };
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
      userContextCandidates: [interest("kr1", 60), interest("kr2", 58)],
      sectorRadarSummary: radar,
      usMarketSummary: {
        asOfKst: new Date().toISOString(),
        available: false,
        conclusion: "no_data",
        summary: "empty",
        signals: [],
        warnings: [],
        diagnostics: { anchorSymbolsRequested: 14, yahooQuoteResultCount: 0, coverageStatus: "empty" },
      },
      usMarketKrCandidates: [],
      usDirectCandidates: [tsla],
      userUsWatchlistCount: 1,
    });
    expect(out.deck.some((c) => c.name.includes("테슬라"))).toBe(false);
    expect(out.deck.filter((c) => c.source === "watchlist" && c.country === "US")).toHaveLength(0);
    expect(out.diagnosticCandidateCards.length).toBeGreaterThan(0);
    expect(out.diagnosticCandidateCards.some((c) => c.name.includes("테슬라"))).toBe(true);
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

  it("moves 7-day repeated symbols to monitoring diagnostics before final deck", () => {
    const repeat = new Map([
      ["a", { candidateRepeatCount7d: 7, lastShownAt: "2026-05-30T00:00:00.000Z", source: "exposed_event" as const }],
    ]);
    const out = composeTodayBriefCandidates({
      userContextCandidates: [interest("a", 90), interest("b", 58), interest("c", 57), interest("d", 56)],
      sectorRadarSummary: { ok: true, generatedAt: "", sectors: [], warnings: [], fearCandidatesTop3: [], greedCandidatesTop3: [] },
      usMarketSummary: usSum(true),
      usMarketKrCandidates: [],
      repeatByCandidateId: repeat,
    });

    expect(out.deck.some((c) => c.candidateId === "a")).toBe(false);
    expect(out.diagnosticCandidateCards.some((c) => c.candidateId === "a")).toBe(true);
    expect(out.qualityMeta.droppedReasons).toContain("repeat_exposure_moved_to_monitoring");
    expect(JSON.stringify(out)).not.toMatch(/매수 후보|자동 리밸런싱|주문 실행/);
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
