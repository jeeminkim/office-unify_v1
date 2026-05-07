import { describe, expect, it } from "vitest";
import {
  computeEtfThemeEligibilityForSector,
  ETF_THEME_GATED_SECTOR_KEYS,
  inferEtfEligibilityFromKeywords,
  lookupEtfThemeProfile,
  resolveEtfQuoteKey,
} from "./sectorRadarEtfThemeCatalog";
import {
  applyEtfThemeGate,
  buildEtfQualityDiagnosticsSnapshot,
  evaluateEtfQuoteQuality,
  resolveQuoteFreshnessPolicy,
} from "./sectorRadarEtfThemeGate";
import type { AnchorMetricRow } from "./sectorRadarScoring";
import { computeStandardSectorSnapshot } from "./sectorRadarScoring";

function krEtfRow(
  symbol: string,
  name: string,
  opts: Partial<AnchorMetricRow> = {},
): AnchorMetricRow {
  return {
    market: "KR",
    symbol,
    name,
    googleTicker: `KRX:${symbol}`,
    sourceLabel: "seed",
    assetType: "ETF",
    dataStatus: "ok",
    price: 100,
    changePct: 2,
    high52: 120,
    low52: 80,
    volume: 1_000_000,
    volumeAvg: 900_000,
    quoteUpdatedAt: "2026-05-07T12:00:00.000Z",
    ...opts,
  };
}

describe("ETF theme catalog & eligibility", () => {
  it("gates ai_power_infra and k_content only", () => {
    expect(ETF_THEME_GATED_SECTOR_KEYS.has("ai_power_infra")).toBe(true);
    expect(ETF_THEME_GATED_SECTOR_KEYS.has("k_content")).toBe(true);
    expect(ETF_THEME_GATED_SECTOR_KEYS.has("semiconductor")).toBe(false);
  });

  it("excludes SOL 조선TOP3플러스 from ai_power_infra regardless of momentum story", () => {
    const e = computeEtfThemeEligibilityForSector({
      sectorKey: "ai_power_infra",
      market: "KR",
      symbol: "466920",
      name: "SOL 조선TOP3플러스",
      assetType: "ETF",
    });
    expect(e.eligible).toBe(false);
    expect(e.reasonCodes).toContain("etf_theme_hard_excluded");
  });

  it("passes strict AI power infra seed ETFs", () => {
    for (const sym of ["487240", "487230", "486450", "491010"]) {
      const e = computeEtfThemeEligibilityForSector({
        sectorKey: "ai_power_infra",
        market: "KR",
        symbol: sym,
        name: sym,
        assetType: "ETF",
      });
      expect(e.eligible).toBe(true);
      expect(e.matchLevel).toBe("strict");
      expect(e.reasonCodes).toContain("etf_theme_strict_match");
    }
  });

  it("passes media / k-culture seed ETFs for k_content", () => {
    const media = computeEtfThemeEligibilityForSector({
      sectorKey: "k_content",
      market: "KR",
      symbol: "395150",
      name: "KODEX 웹툰&드라마",
      assetType: "ETF",
    });
    expect(media.eligible).toBe(true);
    expect(media.matchLevel).toBe("strict");

    const tigerMedia = computeEtfThemeEligibilityForSector({
      sectorKey: "k_content",
      market: "KR",
      symbol: "228810",
      name: "TIGER 미디어컨텐츠",
      assetType: "ETF",
    });
    expect(tigerMedia.eligible).toBe(true);

    const kcont = computeEtfThemeEligibilityForSector({
      sectorKey: "k_content",
      market: "KR",
      symbol: "266360",
      name: "KODEX K콘텐츠",
      assetType: "ETF",
    });
    expect(kcont.eligible).toBe(true);

    const kpop = computeEtfThemeEligibilityForSector({
      sectorKey: "k_content",
      market: "KR",
      symbol: "395290",
      name: "HANARO Fn K-POP&미디어",
      assetType: "ETF",
    });
    expect(kpop.eligible).toBe(true);

    const kculture = computeEtfThemeEligibilityForSector({
      sectorKey: "k_content",
      market: "KR",
      symbol: "0132D0",
      name: "KoAct 글로벌K컬처밸류체인액티브",
      assetType: "ETF",
    });
    expect(kculture.eligible).toBe(true);
  });

  it("does not surface AI power ETFs under media_content sector gate", () => {
    const e = computeEtfThemeEligibilityForSector({
      sectorKey: "k_content",
      market: "KR",
      symbol: "487240",
      name: "KODEX AI전력핵심설비",
      assetType: "ETF",
    });
    expect(e.eligible).toBe(false);
    expect(e.reasonCodes).toContain("etf_theme_hard_excluded");
  });

  it("keyword inference: AI power name passes, 조선 name fails", () => {
    const ok = inferEtfEligibilityFromKeywords("ai_power_infra", "가상의 AI전력인프라 ETF");
    expect(ok?.eligible).toBe(true);
    const bad = inferEtfEligibilityFromKeywords("ai_power_infra", "가상의 조선 테마 ETF");
    expect(bad?.eligible).toBe(false);
  });
});

describe("ETF theme gate + scoring order", () => {
  it("drops SOL 조선TOP3플러스 from ai_power_infra display even with strong quotes", () => {
    const gate = applyEtfThemeGate("ai_power_infra", [
      krEtfRow("466920", "SOL 조선TOP3플러스", { changePct: 20, price: 200 }),
    ]);
    expect(gate.displayRows.some((r) => r.symbol === "466920")).toBe(false);
    expect(gate.traceExcluded.some((t) => t.symbol === "466920")).toBe(true);
    expect(gate.scoringRows.length).toBe(0);
    expect(gate.diagnostics[0]?.hardExcludedCount).toBe(1);
  });

  it("keeps SOL 조선TOP3플러스 visible for shipping (ungated ETF path)", () => {
    const gate = applyEtfThemeGate("shipping", [krEtfRow("466920", "SOL 조선TOP3플러스")]);
    expect(gate.displayRows.some((r) => r.symbol === "466920")).toBe(true);
    expect(gate.scoringRows.length).toBe(1);
  });

  it("omits quote-empty eligible ETF from scoring rows so it cannot beat quote-ok peers", () => {
    const empty = krEtfRow("487240", "KODEX AI전력핵심설비", {
      dataStatus: "empty",
      price: undefined,
      changePct: undefined,
      high52: undefined,
      low52: undefined,
      volume: undefined,
      volumeAvg: undefined,
    });
    const ok = krEtfRow("487230", "KODEX 미국AI전력핵심인프라", { changePct: 1 });
    const gate = applyEtfThemeGate("ai_power_infra", [empty, ok]);
    expect(gate.scoringRows.length).toBe(1);
    expect(gate.scoringRows[0]?.symbol).toBe("487230");
    expect(gate.displayRows.find((r) => r.symbol === "487230")?.etfDisplayGroup).toBe("scored");
    expect(gate.displayRows.find((r) => r.symbol === "487240")?.etfDisplayGroup).toBe("watch_only");

    const onlyEmpty = applyEtfThemeGate("ai_power_infra", [empty]);
    const snapEmpty = computeStandardSectorSnapshot("ai_power_infra", "AI/전력인프라", onlyEmpty.scoringRows);
    const snapOk = computeStandardSectorSnapshot("ai_power_infra", "AI/전력인프라", gate.scoringRows);
    expect(snapEmpty.score).toBe(undefined);
    expect(snapOk.score != null && Number.isFinite(snapOk.score)).toBe(true);
    expect((snapOk.score ?? 0) > 0).toBe(true);
  });

  it("adds quote coverage warnings when many displayed ETFs lack quotes", () => {
    const rows = [
      krEtfRow("487240", "KODEX AI전력핵심설비", { dataStatus: "empty", price: undefined }),
      krEtfRow("487230", "KODEX 미국AI전력핵심인프라", { dataStatus: "empty", price: undefined }),
      krEtfRow("486450", "SOL 미국AI전력인프라", { dataStatus: "ok", price: 50 }),
    ];
    const gate = applyEtfThemeGate("ai_power_infra", rows);
    expect(gate.sectorWarnings).toContain("etf_quote_coverage_low");
  });

  it("classifies stale/invalid/unknown quotes as watch_only and excludes from scoring", () => {
    const stale = krEtfRow("487240", "KODEX AI전력핵심설비", {
      quoteUpdatedAt: "2020-01-01T00:00:00.000Z",
      dataStatus: "ok",
      price: 100,
    });
    const invalid = krEtfRow("487230", "KODEX 미국AI전력핵심인프라", {
      dataStatus: "parse_failed",
      price: undefined,
    });
    const unknown = krEtfRow("486450", "SOL 미국AI전력인프라", {
      quoteUpdatedAt: undefined,
      dataStatus: "ok",
      price: 100,
    });
    const gate = applyEtfThemeGate("ai_power_infra", [stale, invalid, unknown]);
    expect(gate.scoringRows.length).toBe(0);
    expect(gate.displayRows.every((r) => r.etfDisplayGroup === "watch_only")).toBe(true);
    const staleRow = gate.displayRows.find((r) => r.symbol === "487240");
    expect(staleRow?.etfReasonCodes).toContain("etf_quote_stale");
    const invalidRow = gate.displayRows.find((r) => r.symbol === "487230");
    expect(invalidRow?.etfReasonCodes).toContain("etf_quote_invalid");
    const unknownRow = gate.displayRows.find((r) => r.symbol === "486450");
    expect(unknownRow?.etfReasonCodes).toContain("etf_quote_unknown_freshness");
  });

  it("marks hard excluded ETF as excluded group before default hide", () => {
    const gate = applyEtfThemeGate("ai_power_infra", [krEtfRow("466920", "SOL 조선TOP3플러스")]);
    const trace = gate.traceExcluded.find((x) => x.symbol === "466920");
    expect(Boolean(trace)).toBe(true);
    expect(trace?.reasonCodes).toContain("etf_theme_hard_excluded");
  });

  it("builds stable diagnostics counts", () => {
    const rows = [
      krEtfRow("487240", "KODEX AI전력핵심설비", { dataStatus: "ok", price: 100 }),
      krEtfRow("487230", "KODEX 미국AI전력핵심인프라", { dataStatus: "empty", price: undefined }),
      krEtfRow("466920", "SOL 조선TOP3플러스", { dataStatus: "ok", price: 100 }),
    ];
    const gate = applyEtfThemeGate("ai_power_infra", rows);
    const d = gate.diagnostics[0];
    expect(d.totalUniverseCount).toBe(3);
    expect(d.strictCount >= 2).toBe(true);
    expect(d.hardExcludedCount).toBe(1);
    expect(d.quoteMissingCount).toBe(1);
    expect(d.scoringIncludedCount).toBe(1);
    expect(d.displayOnlyCount).toBe(1);
  });

  it("keeps hard-excluded ETF in diagnostic_only mode sector (not blocked)", () => {
    const gate = applyEtfThemeGate("battery", [krEtfRow("466920", "SOL 조선TOP3플러스")]);
    expect(gate.displayRows.some((r) => r.symbol === "466920")).toBe(true);
    const d = gate.diagnostics[0];
    expect(d.mismatchExcludedCount >= 1).toBe(true);
  });

  it("off mode sectors keep existing behavior", () => {
    const gate = applyEtfThemeGate("consumer_retail", [krEtfRow("466920", "SOL 조선TOP3플러스")]);
    expect(gate.displayRows.some((r) => r.symbol === "466920")).toBe(true);
    expect(gate.scoringRows.length).toBe(1);
  });
});

describe("ETF quote alias resolver", () => {
  it("keeps code for generic ETF without alias", () => {
    const p = lookupEtfThemeProfile("KR", "487240");
    expect(Boolean(p)).toBe(true);
    expect(resolveEtfQuoteKey(p!, "google")).toBe("487240");
    expect(resolveEtfQuoteKey(p!, "yahoo")).toBe("487240");
    expect(resolveEtfQuoteKey(p!, "display")).toBe("487240");
  });

  it("prioritizes provider-specific alias for special code ETF", () => {
    const p = lookupEtfThemeProfile("KR", "0132D0");
    expect(Boolean(p)).toBe(true);
    expect(resolveEtfQuoteKey(p!, "google")).toBe("KRX:0132D0");
    expect(resolveEtfQuoteKey(p!, "yahoo")).toBe("0132D0.KS");
    expect(resolveEtfQuoteKey(p!, "display")).toBe("0132D0");
  });

  it("emits key-source reason codes (manual override / alias / fallback)", () => {
    const manualGate = applyEtfThemeGate("k_content", [
      krEtfRow("0132D0", "KoAct 글로벌K컬처밸류체인액티브", {
        etfQuoteKeySource: "manual_override",
      }),
    ]);
    expect(manualGate.displayRows[0]?.etfReasonCodes).toContain("etf_quote_manual_override_applied");

    const aliasGate = applyEtfThemeGate("k_content", [
      krEtfRow("0132D0", "KoAct 글로벌K컬처밸류체인액티브", {
        etfQuoteKeySource: "alias",
      }),
    ]);
    expect(aliasGate.displayRows[0]?.etfReasonCodes).toContain("etf_quote_alias_applied");

    const fallbackGate = applyEtfThemeGate("k_content", [
      krEtfRow("0132D0", "KoAct 글로벌K컬처밸류체인액티브", {
        etfQuoteKeySource: "fallback",
      }),
    ]);
    expect(fallbackGate.displayRows[0]?.etfReasonCodes).toContain("etf_quote_fallback_key_used");
  });
});

describe("ETF quote quality policy", () => {
  it("classifies missing for nullish price", () => {
    const row = krEtfRow("487240", "KODEX AI전력핵심설비", { price: undefined });
    expect(evaluateEtfQuoteQuality(row)).toBe("missing");
  });

  it("classifies invalid for parse_failed or non-positive values", () => {
    const parseFail = krEtfRow("487240", "KODEX AI전력핵심설비", { dataStatus: "parse_failed", price: undefined });
    expect(evaluateEtfQuoteQuality(parseFail)).toBe("invalid");
    const zero = krEtfRow("487240", "KODEX AI전력핵심설비", { price: 0 });
    expect(evaluateEtfQuoteQuality(zero)).toBe("invalid");
  });

  it("classifies unknown when timestamp is missing or unparsable", () => {
    const missingTs = krEtfRow("487240", "KODEX AI전력핵심설비", { quoteUpdatedAt: undefined, price: 100 });
    expect(evaluateEtfQuoteQuality(missingTs)).toBe("unknown");
    const badTs = krEtfRow("487240", "KODEX AI전력핵심설비", { quoteUpdatedAt: "not-a-date", price: 100 });
    expect(evaluateEtfQuoteQuality(badTs)).toBe("unknown");
  });

  it("uses freshness policy with weekend tolerance", () => {
    const policyKr = resolveQuoteFreshnessPolicy("KR");
    const policyUs = resolveQuoteFreshnessPolicy("US");
    const policyUnknown = resolveQuoteFreshnessPolicy(undefined);
    expect(policyKr.maxCalendarAgeHours).toBe(72);
    expect(policyUs.maxCalendarAgeHours).toBe(96);
    expect(policyUnknown.market).toBe("UNKNOWN");

    const friday = Date.parse("2026-05-08T12:00:00.000Z");
    const oldOnWeekend = krEtfRow("487240", "KODEX AI전력핵심설비", {
      quoteUpdatedAt: "2026-05-06T12:00:00.000Z",
      price: 100,
    });
    expect(evaluateEtfQuoteQuality(oldOnWeekend, friday)).toBe("ok");
  });

  it("snapshot builder summarizes diagnostics without side effects", () => {
    const gate = applyEtfThemeGate("ai_power_infra", [
      krEtfRow("487240", "KODEX AI전력핵심설비"),
      krEtfRow("487230", "KODEX 미국AI전력핵심인프라", { quoteUpdatedAt: undefined }),
      krEtfRow("466920", "SOL 조선TOP3플러스"),
    ]);
    const snap = buildEtfQualityDiagnosticsSnapshot("explicit_refresh", gate.diagnostics);
    expect(snap.source).toBe("explicit_refresh");
    expect(snap.summary.totalSectors).toBe(gate.diagnostics.length);
    expect(snap.summary.hardExcludedCount >= 1).toBe(true);
  });
});
