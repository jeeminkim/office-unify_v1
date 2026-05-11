import { describe, expect, it } from "vitest";
import type { TodayBriefWithCandidatesResponse } from "@/lib/todayCandidatesContract";

/**
 * GET /api/dashboard/today-brief 의존성이 많아 전체 핸들러 E2E는 생략하고,
 * 응답 계약(qualityMeta.scoreExplanationSummary)만 타입 수준에서 고정한다.
 * 실제 조합 로직은 lib/server/todayBriefScoreExplanation*.test.ts 및 composer 테스트가 검증한다.
 */
describe("GET /api/dashboard/today-brief contract (additive)", () => {
  it("allows scoreExplanationSummary on qualityMeta.todayCandidates", () => {
    const sample: TodayBriefWithCandidatesResponse = {
      ok: true,
      generatedAt: new Date().toISOString(),
      lines: [{ title: "t", body: "b", severity: "info", source: [] }],
      badges: [],
      qualityMeta: {
        todayCandidates: {
          generatedAt: new Date().toISOString(),
          userContextCount: 0,
          usMarketKrCount: 0,
          usMarketDataAvailable: false,
          warnings: [],
          scoreExplanationSummary: {
            explainedCandidateCount: 3,
            factorCounts: { interest_match: 2, sector_radar_match: 1, portfolio_concentration: 1 },
            profileStatus: "missing",
          },
          concentrationRiskSummary: {
            assessedCandidateCount: 3,
            highRiskCount: 0,
            mediumRiskCount: 1,
            dataQuality: "partial",
            reasonCounts: { theme_overweight: 1 },
          },
        },
      },
    };
    expect(sample.qualityMeta?.todayCandidates?.scoreExplanationSummary?.explainedCandidateCount).toBe(3);
    expect(sample.qualityMeta?.todayCandidates?.concentrationRiskSummary?.mediumRiskCount).toBe(1);
  });
});
