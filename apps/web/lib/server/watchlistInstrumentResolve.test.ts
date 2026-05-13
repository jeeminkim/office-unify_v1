import { describe, expect, it } from "vitest";
import { resolveWatchlistInstrument } from "./watchlistInstrumentResolve";

describe("resolveWatchlistInstrument", () => {
  it("resolves 한화오션 by exact KR name", () => {
    const out = resolveWatchlistInstrument({
      market: "KR",
      name: "한화오션",
      symbol: "",
      holdings: [],
      watchlist: [],
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.resolved.symbol).toBe("042660");
      expect(out.resolved.googleTicker.toUpperCase()).toContain("042660");
      expect(out.resolved.quoteSymbol).toMatch(/042660\.(KS|KQ)/);
    }
  });

  it("resolves symbol 042660 to name", () => {
    const out = resolveWatchlistInstrument({
      market: "KR",
      symbol: "042660",
      name: "",
      holdings: [],
      watchlist: [],
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.resolved.resolvedName).toContain("한화");
    }
  });
});
