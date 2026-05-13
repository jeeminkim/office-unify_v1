import { describe, expect, it } from "vitest";

/** 응답 계약 고정 — 핸들러는 Supabase·인증 의존으로 E2E 생략. */
describe("GET /api/dashboard/theme-connections contract (additive)", () => {
  it("allows readOnly qualityMeta and summary shape", () => {
    const sample = {
      ok: true,
      range: "7d",
      generatedAt: new Date().toISOString(),
      themeConnectionMap: [] as unknown[],
      summary: {
        mappedThemeCount: 0,
        linkedInstrumentCount: 0,
        confidenceCounts: { high: 0, medium: 0, low: 0, missing: 0 },
        missingThemeCount: 0,
      },
      qualityMeta: {
        readOnly: true,
        sourceCounts: {} as Record<string, number>,
        confidenceCounts: { high: 0, medium: 0, low: 0, missing: 0 },
        truncated: false,
        watchlistSourceAvailable: false,
      },
    };
    expect(sample.qualityMeta.readOnly).toBe(true);
    expect(sample.themeConnectionMap).toEqual([]);
  });
});
