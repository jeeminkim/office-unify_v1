import { describe, expect, it } from "vitest";
import {
  mergeResearchTimingWarnings,
  RESEARCH_NEAR_TIMEOUT_RATIO,
  RESEARCH_PROVIDER_SLOW_MS,
  shouldWarnNearTimeout,
  shouldWarnProviderSlow,
} from "./researchCenterTimings";

describe("researchCenterTimings", () => {
  it("flags provider slow at configured threshold", () => {
    expect(shouldWarnProviderSlow(RESEARCH_PROVIDER_SLOW_MS)).toBe(true);
    expect(shouldWarnProviderSlow(RESEARCH_PROVIDER_SLOW_MS - 1)).toBe(false);
  });

  it("flags near timeout at 80% of budget", () => {
    const budget = 100_000;
    expect(shouldWarnNearTimeout(Math.floor(budget * RESEARCH_NEAR_TIMEOUT_RATIO), budget)).toBe(true);
    expect(shouldWarnNearTimeout(Math.floor(budget * RESEARCH_NEAR_TIMEOUT_RATIO) - 1, budget)).toBe(false);
  });

  it("merges additive warnings without duplicates", () => {
    const out = mergeResearchTimingWarnings(["other"], {
      providerMs: RESEARCH_PROVIDER_SLOW_MS,
      totalMs: 80_000,
      timeoutBudgetMs: 100_000,
    });
    expect(out).toContain("research_provider_slow");
    expect(out).toContain("research_generation_near_timeout");
    expect(out.filter((w) => w === "research_provider_slow").length).toBe(1);
  });
});
