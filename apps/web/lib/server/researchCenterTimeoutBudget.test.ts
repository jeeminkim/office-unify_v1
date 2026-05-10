import { describe, expect, it } from "vitest";
import {
  RESEARCH_CENTER_TOTAL_TIMEOUT_MS_DEFAULT,
  parseResearchCenterTotalTimeoutMs,
} from "@office-unify/shared-types";
import { applyTimeoutBudgetToQualityMeta, parseResearchCenterTimeoutBudget } from "./researchCenterTimeoutBudget";

describe("researchCenterTimeoutBudget", () => {
  it("uses safe defaults when env unset", () => {
    const b = parseResearchCenterTimeoutBudget({});
    expect(b.totalMs).toBe(RESEARCH_CENTER_TOTAL_TIMEOUT_MS_DEFAULT);
    expect(b.providerPerCallMs).toBe(120_000);
    expect(b.finalizerMs).toBe(120_000);
    expect(b.sheetsMs).toBe(45_000);
    expect(b.contextCacheMs).toBe(45_000);
    expect(b.invalidEnvKeys.length).toBe(0);
  });

  it("parses numeric env values", () => {
    const b = parseResearchCenterTimeoutBudget({
      RESEARCH_CENTER_TOTAL_TIMEOUT_MS: "90000",
      RESEARCH_CENTER_PROVIDER_TIMEOUT_MS: "60000",
      RESEARCH_CENTER_FINALIZER_TIMEOUT_MS: "90000",
      RESEARCH_CENTER_SHEETS_TIMEOUT_MS: "30000",
      RESEARCH_CENTER_CONTEXT_CACHE_TIMEOUT_MS: "20000",
    });
    expect(b.totalMs).toBe(90_000);
    expect(b.providerPerCallMs).toBe(60_000);
    expect(b.finalizerMs).toBe(90_000);
    expect(b.sheetsMs).toBe(30_000);
    expect(b.contextCacheMs).toBe(20_000);
  });

  it("falls back on invalid env and records keys", () => {
    const b = parseResearchCenterTimeoutBudget({
      RESEARCH_CENTER_TOTAL_TIMEOUT_MS: "nope",
    });
    expect(b.totalMs).toBe(RESEARCH_CENTER_TOTAL_TIMEOUT_MS_DEFAULT);
    expect(b.invalidEnvKeys).toContain("RESEARCH_CENTER_TOTAL_TIMEOUT_MS");
  });

  it("parseResearchCenterTotalTimeoutMs aligns client abort with server default", () => {
    expect(parseResearchCenterTotalTimeoutMs(undefined)).toBe(RESEARCH_CENTER_TOTAL_TIMEOUT_MS_DEFAULT);
    expect(parseResearchCenterTotalTimeoutMs("95000")).toBe(95_000);
    expect(parseResearchCenterTotalTimeoutMs("nope")).toBe(RESEARCH_CENTER_TOTAL_TIMEOUT_MS_DEFAULT);
    expect(parseResearchCenterTotalTimeoutMs("12")).toBe(10_000);
    expect(parseResearchCenterTotalTimeoutMs("400000")).toBe(300_000);
  });

  it("does not put secret values in qualityMeta", () => {
    const b = parseResearchCenterTimeoutBudget({
      RESEARCH_CENTER_TOTAL_TIMEOUT_MS: "100000",
    });
    const meta = {
      requestId: "r1",
      status: "ok" as const,
      generatedAt: new Date().toISOString(),
      provider: "gemini" as const,
      warnings: [] as string[],
      timings: { totalMs: 0, timeoutBudgetMs: 0, nearTimeout: false },
      opsLogging: {
        attempted: 0,
        written: 0,
        skippedCooldown: 0,
        skippedBudgetExceeded: 0,
        skippedReadOnly: 0,
      },
    };
    applyTimeoutBudgetToQualityMeta(meta, b);
    expect(JSON.stringify(meta)).not.toContain("GEMINI");
    expect(meta.timeoutBudget?.totalMs).toBe(100_000);
  });
});
