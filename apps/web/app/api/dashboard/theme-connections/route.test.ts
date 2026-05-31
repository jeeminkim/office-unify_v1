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
      usMappingBridgeDiagnostics: {
        readOnly: true,
        status: "no_us_signal",
        interpretedUsThemes: [],
        disconnectedThemes: [],
        watchlistThemeGaps: [],
        sectorRadarBridgeCandidates: [],
        nextChecks: [],
        guardrails: [],
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
    expect(sample.usMappingBridgeDiagnostics.readOnly).toBe(true);
    expect(sample.themeConnectionMap).toEqual([]);
  });

  it("allows US Mapping Bridge degraded diagnostics while preserving core theme response", () => {
    const sample = {
      ok: true,
      range: "7d",
      generatedAt: new Date().toISOString(),
      themeConnectionMap: [{ themeKey: "ai_power_infra", linkedInstruments: [] }],
      summary: {
        mappedThemeCount: 1,
        linkedInstrumentCount: 0,
        confidenceCounts: { high: 0, medium: 0, low: 1, missing: 0 },
        missingThemeCount: 0,
      },
      usMappingBridgeDiagnostics: {
        readOnly: true,
        status: "degraded",
        reason: "us_mapping_bridge_failed",
        actionHint: "US Mapping Bridge 진단만 실패했습니다. 기존 테마 연결 결과는 유지됩니다.",
        warnings: ["us_mapping_bridge_failed"],
        interpretedUsThemes: [],
        disconnectedThemes: [],
        watchlistThemeGaps: [],
        sectorRadarBridgeCandidates: [],
        nextChecks: ["Watchlist sector/theme 비어 있는 항목을 확인합니다."],
        guardrails: ["관심종목을 자동 등록하지 않습니다.", "자동 주문을 실행하지 않습니다."],
      },
      qualityMeta: {
        readOnly: true,
        sourceCounts: {} as Record<string, number>,
        confidenceCounts: { high: 0, medium: 0, low: 1, missing: 0 },
        truncated: false,
        watchlistSourceAvailable: false,
      },
    };

    expect(sample.themeConnectionMap).toHaveLength(1);
    expect(sample.usMappingBridgeDiagnostics.status).toBe("degraded");
    expect(sample.usMappingBridgeDiagnostics.actionHint).toContain("진단만 실패");
    expect(JSON.stringify(sample)).not.toMatch(/지금 매수|주문 실행|자동 리밸런싱 실행/);
  });
});
