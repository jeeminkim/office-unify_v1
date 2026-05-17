import { describe, expect, it } from "vitest";
import { matchWatchlistSector } from "./watchlistSectorMatcher";

describe("watchlist sector matcher", () => {
  it("matches GS리테일 known map", () => {
    const r = matchWatchlistSector({ name: "GS리테일", symbol: "KR:007070", googleTicker: "KRX:007070" });
    expect(r.matchedSector).toBe("소비/유통");
    expect(r.confidence).toBeGreaterThanOrEqual(75);
  });

  it("matches HLB known map", () => {
    const r = matchWatchlistSector({ name: "HLB", symbol: "KR:028300", googleTicker: "KRX:028300" });
    expect(r.matchedSector).toBe("바이오/헬스케어");
    expect(r.confidence).toBeGreaterThanOrEqual(75);
  });

  it("matches TIGER미디어컨텐츠 known map", () => {
    const r = matchWatchlistSector({ name: "TIGER미디어컨텐츠", symbol: "KR:228810", googleTicker: "KRX:228810" });
    expect(r.matchedSector).toBe("K-콘텐츠/미디어");
    expect(r.confidence).toBeGreaterThanOrEqual(75);
  });

  it("matches PANW known map", () => {
    const r = matchWatchlistSector({
      name: "팔로알토 네트웍스",
      symbol: "US:PANW",
      googleTicker: "NASDAQ:PANW",
    });
    expect(r.matchedSector).toBe("사이버보안");
    expect(r.confidence).toBeGreaterThanOrEqual(75);
  });

  it("matches TSLA known map", () => {
    const r = matchWatchlistSector({ name: "테슬라", symbol: "US:TSLA", googleTicker: "NASDAQ:TSLA" });
    expect(r.matchedSector).toBe("전기차/자율주행");
    expect(r.confidence).toBeGreaterThanOrEqual(75);
  });

  it("returns no_match for unknown", () => {
    const r = matchWatchlistSector({ name: "UNKNOWN COMPANY", symbol: "US:ZZZZ" });
    expect(["no_match", "needs_review"]).toContain(r.status);
  });

  it("matches 롯데케미칼 and exposes matchScores", () => {
    const r = matchWatchlistSector({
      name: "롯데케미칼",
      symbol: "KR:011170",
      googleTicker: "KRX:011170",
    });
    expect(r.matchedSector).toBe("화학/소재");
    expect(r.matchScores?.registryAliasScore).toBeGreaterThan(0);
    expect(r.matchScores?.quoteValidationScore).toBeGreaterThan(0);
  });

  it("does not treat quote-only as high confidence sector without registry", () => {
    const r = matchWatchlistSector({
      name: "UNKNOWN XYZ",
      symbol: "US:ZZZZ",
      googleTicker: "NASDAQ:ZZZZ",
      quoteSymbol: "ZZZZ",
    });
    expect(r.matchedSector).toBeNull();
    expect(r.matchScores?.quoteValidationScore).toBeGreaterThan(0);
    expect(r.confidence).toBe(0);
  });
});
