import { describe, expect, it } from "vitest";
import { matchWatchlistSector } from "./watchlistSectorMatcher";

describe("watchlist sector matcher", () => {
  it("matches GS리테일 known map", () => {
    const r = matchWatchlistSector({ name: "GS리테일", symbol: "KR:007070" });
    expect(r.matchedSector).toBe("소비/유통");
    expect(r.confidence >= 90).toBeTruthy();
  });

  it("matches HLB known map", () => {
    const r = matchWatchlistSector({ name: "HLB", symbol: "KR:028300" });
    expect(r.matchedSector).toBe("바이오/헬스케어");
    expect(r.confidence >= 90).toBeTruthy();
  });

  it("matches TIGER미디어컨텐츠 known map", () => {
    const r = matchWatchlistSector({ name: "TIGER미디어컨텐츠", symbol: "KR:228810" });
    expect(r.matchedSector).toBe("K-콘텐츠/미디어");
    expect(r.confidence >= 90).toBeTruthy();
  });

  it("matches PANW known map", () => {
    const r = matchWatchlistSector({ name: "팔로알토 네트웍스", symbol: "US:PANW" });
    expect(r.matchedSector).toBe("사이버보안");
    expect(r.confidence >= 90).toBeTruthy();
  });

  it("matches TSLA known map", () => {
    const r = matchWatchlistSector({ name: "테슬라", symbol: "US:TSLA" });
    expect(r.matchedSector).toBe("전기차/자율주행");
    expect(r.confidence >= 90).toBeTruthy();
  });

  it("returns no_match for unknown", () => {
    const r = matchWatchlistSector({ name: "UNKNOWN COMPANY", symbol: "US:ZZZZ" });
    expect(["no_match", "needs_review"]).toContain(r.status);
  });
});
