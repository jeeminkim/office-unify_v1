import { describe, expect, it } from "vitest";
import type { SectorRadarSummarySector } from "@/lib/sectorRadarContract";
import type { TodayStockCandidate } from "@/lib/todayCandidatesContract";
import type { UsKrSignalDiagnostics } from "@/lib/server/usSignalCandidateDiagnostics";
import {
  buildThemeConnectionMap,
  buildThemeConnectionSummary,
  buildThemeLinkSourceHistogram,
  buildUsKrEmptyThemeBridgeHint,
  classifyThemeLinkConfidence,
  enrichPrimaryDeckWithThemeConnections,
  explainThemeLink,
  mapSectorRadarThemeToThemeKey,
  matchCandidateThemeBinding,
  normalizeThemeKey,
  truncateThemeConnectionMap,
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

  it("mapSectorRadarThemeToThemeKey maps buckets and falls back", () => {
    expect(mapSectorRadarThemeToThemeKey("ai_power_infra")).toBe("ai_power_infra");
    expect(mapSectorRadarThemeToThemeKey("nuclear_smr")).toBe("k_nuclear");
    expect(mapSectorRadarThemeToThemeKey("shipbuilding")).toBe("shipbuilding");
    expect(mapSectorRadarThemeToThemeKey("bio_healthcare")).toBe("biotech");
    expect(mapSectorRadarThemeToThemeKey("  AI_POWER_INFRA  ")).toBe("ai_power_infra");
  });

  it("explainThemeLink watchlist uses direct-connection copy", () => {
    const s = explainThemeLink({
      themeLabel: "조선",
      source: "watchlist",
      confidence: "medium",
    });
    expect(s).toContain("관심종목 직접 연결");
    expect(s).toContain("후보 수를 늘리지");
  });

  it("truncateThemeConnectionMap flags truncated when over limits", () => {
    const full = Array.from({ length: 6 }, (_, i) => ({
      themeKey: `t${i}`,
      themeLabel: `T${i}`,
      linkedInstruments: Array.from({ length: 10 }, (_, j) => ({
        symbol: `KR:${i}${j}`,
        type: "stock" as const,
        source: "today_candidate" as const,
        confidence: "low" as const,
        reason: "r",
        market: "KR" as const,
      })),
      confidence: "low" as const,
    }));
    const { map, truncated } = truncateThemeConnectionMap(full as never, 5, 8);
    expect(truncated).toBe(true);
    expect(map.length).toBe(5);
    expect(map[0]?.linkedInstruments.length).toBeLessThanOrEqual(8);
  });

  it("buildThemeLinkSourceHistogram counts sources", () => {
    const h = buildThemeLinkSourceHistogram([
      {
        themeKey: "a",
        themeLabel: "A",
        representativeEtf: {
          symbol: "US:SMH",
          type: "etf",
          source: "sector_radar",
          confidence: "high",
          reason: "r",
          market: "ETF",
        },
        linkedInstruments: [
          { symbol: "KR:1", type: "stock", source: "watchlist", confidence: "medium", reason: "r", market: "KR" },
        ],
        confidence: "high",
      },
    ] as never);
    expect(h.sector_radar).toBeGreaterThanOrEqual(1);
    expect(h.watchlist).toBe(1);
  });

  it("enrichPrimaryDeckWithThemeConnections preserves deck length", () => {
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
    expect(out.deck.length).toBe(deck.length);
    expect(out.themeConnectionMapFull.length).toBeGreaterThanOrEqual(out.themeConnectionMap.length);
    expect(out.themeConnectionSummary.mappedThemeCount).toBeGreaterThanOrEqual(0);
    expect(out.deck[0].themeConnection?.themeKey).toBeDefined();
  });

  it("buildThemeConnectionMap includes watchlist keyword matches", () => {
    const items = buildThemeConnectionMap({
      sectorRadarSectors: [],
      holdingRows: [],
      userContextCandidates: [],
      usMarketKrCandidates: [],
      usSignals: [],
      watchlistRows: [{ symbol: "000660", market: "KR", name: "SK하이닉스", sector: "반도체" }],
      watchlistSourceAvailable: true,
    });
    const ai = items.find((x) => x.themeKey === "ai_power_infra");
    expect(ai?.linkedInstruments.some((x) => x.source === "watchlist")).toBe(true);
    expect(ai?.linkedInstruments.find((x) => x.source === "watchlist")?.reason).toContain("관심종목 직접 연결");
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
