import { describe, expect, it } from "vitest";
import type { SectorRadarSummarySector } from "@/lib/sectorRadarContract";
import type { TodayStockCandidate } from "@/lib/todayCandidatesContract";
import type { UsKrSignalDiagnostics } from "@/lib/server/usSignalCandidateDiagnostics";
import {
  buildThemeConnectionMap,
  buildThemeConnectionSummary,
  buildUsKrEmptyThemeBridgeHint,
  classifyThemeLinkConfidence,
  enrichPrimaryDeckWithThemeConnections,
  explainThemeLink,
  matchCandidateThemeBinding,
  normalizeThemeKey,
} from "./themeConnectionMap";

describe("themeConnectionMap EVO-007", () => {
  it("normalizeThemeKey strips noise", () => {
    expect(normalizeThemeKey("  AI 전력 인프라 ")).toContain("ai");
    expect(normalizeThemeKey("ai_power_infra")).toBe("ai_power_infra");
  });

  it("classifyThemeLinkConfidence explicit tiers", () => {
    expect(
      classifyThemeLinkConfidence({
        explicitRegistryKeyMatch: true,
        sectorRadarKeyMatch: false,
        sectorLabelDirectMatch: false,
        partialKeywordMatch: false,
      }),
    ).toBe("high");
    expect(
      classifyThemeLinkConfidence({
        explicitRegistryKeyMatch: false,
        sectorRadarKeyMatch: true,
        sectorLabelDirectMatch: false,
        partialKeywordMatch: false,
      }),
    ).toBe("high");
    expect(
      classifyThemeLinkConfidence({
        explicitRegistryKeyMatch: false,
        sectorRadarKeyMatch: false,
        sectorLabelDirectMatch: true,
        partialKeywordMatch: false,
      }),
    ).toBe("medium");
    expect(
      classifyThemeLinkConfidence({
        explicitRegistryKeyMatch: false,
        sectorRadarKeyMatch: false,
        sectorLabelDirectMatch: false,
        partialKeywordMatch: true,
      }),
    ).toBe("low");
    expect(
      classifyThemeLinkConfidence({
        explicitRegistryKeyMatch: false,
        sectorRadarKeyMatch: false,
        sectorLabelDirectMatch: false,
        partialKeywordMatch: false,
      }),
    ).toBe("missing");
  });

  it("explainThemeLink returns Korean guidance", () => {
    const s = explainThemeLink({
      themeLabel: "조선",
      source: "sector_radar",
      confidence: "high",
    });
    expect(s).toContain("Sector Radar");
    expect(s).toContain("조선");
  });

  it("buildThemeConnectionMap links sector radar ETF and holdings keywords", () => {
    const sectors: SectorRadarSummarySector[] = [
      {
        key: "ai_power_infra",
        name: "AI/전력 인프라",
        zone: "neutral",
        actionHint: "hold",
        narrativeHint: "",
        anchors: [
          {
            symbol: "SMH",
            name: "반도체 ETF",
            googleTicker: "SMH",
            sourceLabel: "seed",
            dataStatus: "ok",
            etfQuoteQualityStatus: "ok",
          },
        ],
        components: {},
        warnings: [],
      },
    ];
    const items = buildThemeConnectionMap({
      sectorRadarSectors: sectors,
      holdingRows: [{ name: "데이터센터 전력", sector: "기계", symbol: "034020", market: "KR" }],
      userContextCandidates: [],
      usMarketKrCandidates: [],
      usSignals: [{ label: "AI 테마 강세", signalKey: "us_ai" }],
    });
    const ai = items.find((x) => x.themeKey === "ai_power_infra");
    expect(ai?.representativeEtf?.symbol).toContain("SMH");
    expect(ai?.linkedInstruments.some((x) => x.source === "portfolio_holding")).toBe(true);
    expect(ai?.linkedInstruments.some((x) => x.source === "us_signal")).toBe(true);
  });

  it("buildThemeConnectionSummary counts confidence buckets", () => {
    const summary = buildThemeConnectionSummary([
      { themeKey: "a", themeLabel: "A", linkedInstruments: [], confidence: "high" },
      { themeKey: "b", themeLabel: "B", linkedInstruments: [{ symbol: "x", type: "stock", source: "today_candidate", confidence: "low", reason: "r", market: "KR" }], confidence: "low" },
    ] as never);
    expect(summary.confidenceCounts.high).toBe(1);
    expect(summary.confidenceCounts.low).toBe(1);
  });

  it("enrichPrimaryDeckWithThemeConnections attaches themeConnection", () => {
    const deck: TodayStockCandidate[] = [
      {
        candidateId: "1",
        name: "삼성전자",
        market: "KOSPI",
        country: "KR",
        stockCode: "005930",
        source: "user_context",
        score: 50,
        confidence: "medium",
        riskLevel: "medium",
        reasonSummary: "반도체 관찰",
        reasonDetails: [],
        positiveSignals: [],
        cautionNotes: [],
        relatedUserContext: [],
        relatedWatchlistSymbols: [],
        isBuyRecommendation: false,
        sector: "반도체",
      },
    ];
    const out = enrichPrimaryDeckWithThemeConnections(deck, {
      sectorRadarSectors: [],
      holdingRows: [],
      userContextCandidates: deck,
      usMarketKrCandidates: [],
      usSignals: [],
    });
    expect(out.themeConnectionSummary.mappedThemeCount).toBeGreaterThanOrEqual(0);
    expect(out.deck[0].themeConnection?.themeKey).toBeDefined();
  });

  it("matchCandidateThemeBinding picks biotech keywords", () => {
    const c: TodayStockCandidate = {
      candidateId: "b",
      name: "셀트리온",
      market: "KOSPI",
      country: "KR",
      stockCode: "068270",
      source: "user_context",
      score: 50,
      confidence: "medium",
      riskLevel: "medium",
      reasonSummary: "바이오 임상 이슈",
      reasonDetails: [],
      positiveSignals: [],
      cautionNotes: [],
      relatedUserContext: [],
      relatedWatchlistSymbols: [],
      isBuyRecommendation: false,
    };
    const b = matchCandidateThemeBinding(c, undefined);
    expect(b?.themeKey).toBe("biotech");
  });

  it("buildUsKrEmptyThemeBridgeHint when usToKrMappingEmpty and weak map", () => {
    const diag: UsKrSignalDiagnostics = {
      primaryReason: "usToKrMappingEmpty",
      userMessage: "u",
      reasonCodes: ["usToKrMappingEmpty"],
    };
    const summary = {
      mappedThemeCount: 0,
      linkedInstrumentCount: 0,
      confidenceCounts: { high: 0, medium: 0, low: 1, missing: 3 },
      missingThemeCount: 3,
    };
    const map = [{ themeKey: "ai_power_infra", themeLabel: "AI", linkedInstruments: [], confidence: "missing" as const }];
    const hint = buildUsKrEmptyThemeBridgeHint({
      diagnostics: diag,
      themeConnectionSummary: summary,
      themeConnectionMap: map as never,
    });
    expect(hint).toBeDefined();
    expect(hint).toContain("한국 종목 연결");
  });
});
