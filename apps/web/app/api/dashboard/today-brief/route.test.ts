import { describe, expect, it } from "vitest";
import type { TodayBriefWithCandidatesResponse, TodayStockCandidate } from "@/lib/todayCandidatesContract";

/**
 * GET /api/dashboard/today-brief 의존성이 많아 전체 핸들러 E2E는 생략하고,
 * 응답 계약(qualityMeta.scoreExplanationSummary)만 타입 수준에서 고정한다.
 * 실제 조합 로직은 lib/server/todayBriefScoreExplanation*.test.ts 및 composer 테스트가 검증한다.
 */
describe("GET /api/dashboard/today-brief contract (additive)", () => {
  const candidate: TodayStockCandidate = {
    candidateId: "contract-1",
    name: "Contract Candidate",
    market: "KOSPI",
    country: "KR",
    source: "user_context",
    score: 52,
    confidence: "medium",
    riskLevel: "medium",
    reasonSummary: "관찰 후보",
    reasonDetails: ["데이터 확인 필요"],
    positiveSignals: [],
    cautionNotes: ["관찰 전용"],
    relatedUserContext: [],
    relatedWatchlistSymbols: [],
    isBuyRecommendation: false,
    scoreBreakdown: {
      baseScore: 50,
      watchlistBoost: 2,
      sectorBoost: 0,
      usSignalBoost: 0,
      quoteQualityPenalty: 0,
      repeatExposurePenalty: 0,
      corporateActionPenalty: 0,
      riskPenalty: 0,
      finalScore: 52,
    },
    decisionTrace: {
      decisionStatus: "selected",
      candidateBucket: "watchlist",
      selectedReasons: [],
      suppressedReasons: [],
      rejectedReasons: [],
      downgradeReasons: [],
      missingEvidence: [],
      dataQualityFlags: [],
      riskFlags: [],
      nextChecks: ["공시 확인"],
      doNotDo: ["거래 실행 지시 없음"],
    },
    judgmentQuality: { score: 50, level: "medium", reasons: [], penalties: [] },
  };

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
          themeConnectionSummary: {
            mappedThemeCount: 2,
            linkedInstrumentCount: 4,
            confidenceCounts: { high: 1, medium: 1, low: 0, missing: 0 },
            missingThemeCount: 0,
            truncated: true,
            watchlistSourceAvailable: false,
          },
        },
      },
    };
    expect(sample.qualityMeta?.todayCandidates?.scoreExplanationSummary?.explainedCandidateCount).toBe(3);
    expect(sample.qualityMeta?.todayCandidates?.concentrationRiskSummary?.mediumRiskCount).toBe(1);
    expect(sample.qualityMeta?.todayCandidates?.themeConnectionSummary?.mappedThemeCount).toBe(2);
  });

  it("preserves the broad today-brief response contract before service extraction", () => {
    const sample: TodayBriefWithCandidatesResponse = {
      ok: true,
      generatedAt: "2026-05-20T00:00:00.000Z",
      lines: [{ title: "오늘 점검", body: "관찰 후보와 데이터 상태를 확인하세요.", severity: "info", source: ["contract"] }],
      badges: ["QUOTE_OK"],
      degraded: false,
      warnings: [],
      candidates: {
        userContext: [candidate],
        usMarketKr: [candidate],
      },
      primaryCandidateDeck: [candidate],
      diagnosticCandidateCards: [candidate],
      usKrSignalDiagnostics: {
        primaryReason: "upstream_empty_result",
        userMessage: "미국장 후보가 비어 있습니다.",
        reasonCodes: ["upstream_empty_result"],
      },
      usMarketSummary: {
        asOfKst: "2026-05-20T09:00:00+09:00",
        available: false,
        conclusion: "no_data",
        summary: "데이터 부족",
        signals: [],
        warnings: ["no_data"],
        diagnostics: {
          yahooQuoteResultCount: 0,
          anchorSymbolsRequested: 18,
          fetchFailed: false,
          coverageStatus: "degraded",
        },
      },
      disclaimer: "매수 권유가 아니라 관찰 목록입니다.",
      qualityMeta: {
        todayCandidates: {
          generatedAt: "2026-05-20T00:00:00.000Z",
          userContextCount: 1,
          usMarketKrCount: 1,
          usMarketDataAvailable: false,
          warnings: [],
          personalization: {
            openActionItemCount: 1,
            staleActionItemCount: 0,
            repeatedPatternCount: 0,
            dataBlockerCount: 1,
          },
          usCoverage: { status: "degraded", message: "미국 데이터가 부족합니다." },
          usCandidateDiagnostics: {
            status: "degraded",
            userUsWatchlistCount: 0,
            userUsHoldingCount: 0,
            seedSymbolCount: 18,
            quoteOkCount: 0,
            quoteMissingCount: 18,
            quoteStaleCount: 0,
            usMarketSummaryStatus: "degraded",
            poolCandidateCount: 0,
            poolUsDirectCount: 0,
            poolUsKrMappedCount: 0,
            selectedUsCandidateCount: 0,
            selectedUsKrMappedCount: 0,
            selectedUsDirectCount: 0,
            suppressedUsCandidateCount: 0,
            rejectedUsCandidateCount: 0,
            topRejectReasons: [],
            topSuppressReasons: [],
            slotPolicy: {
              usSlotEnabled: false,
              minUsCandidateTarget: 0,
              maxUsCandidateTarget: 1,
            },
          },
          scoreBreakdownSummary: { avgFinalScore: 52, repeatPenaltyAppliedCount: 0, corporateRiskGatedCount: 0 },
          decisionTraceSummary: {
            selectedCount: 1,
            suppressedCount: 0,
            rejectedCount: 0,
            downgradedCount: 0,
            riskReviewCount: 0,
            topSuppressedReasons: [],
            topRejectedReasons: [],
            topMissingEvidence: [],
            traceCoverageRatio: 1,
          },
          judgmentQualitySummary: {
            avgScore: 50,
            highCount: 0,
            mediumCount: 1,
            lowCount: 0,
            unknownCount: 0,
          },
          feedbackSummary: {
            hide7dActiveCount: 0,
            reviewedCount: 0,
            keepObservingCount: 0,
            suppressedByFeedbackCount: 0,
          },
          concentrationRiskSummary: {
            assessedCandidateCount: 1,
            highRiskCount: 0,
            mediumRiskCount: 0,
            dataQuality: "partial",
            reasonCounts: {},
          },
          themeConnectionSummary: {
            mappedThemeCount: 0,
            linkedInstrumentCount: 0,
            confidenceCounts: { high: 0, medium: 0, low: 0, missing: 0 },
            missingThemeCount: 0,
            truncated: false,
            watchlistSourceAvailable: false,
          },
          usMappingBridgeDiagnostics: {
            readOnly: true,
            status: "no_us_signal",
            interpretedUsThemes: [],
            disconnectedThemes: [],
            watchlistThemeGaps: [],
            sectorRadarBridgeCandidates: [],
            nextChecks: ["다음 Today Brief에서 usCoverage/gatingReason 재확인"],
            guardrails: ["자동 주문 없음"],
          },
        },
      },
    };

    expect(sample.ok).toBe(true);
    expect(sample.lines).toHaveLength(1);
    expect(sample.candidates?.userContext[0]?.isBuyRecommendation).toBe(false);
    expect(sample.primaryCandidateDeck?.[0]?.scoreBreakdown?.finalScore).toBe(52);
    expect(sample.primaryCandidateDeck?.[0]?.decisionTrace?.decisionStatus).toBe("selected");
    expect(sample.primaryCandidateDeck?.[0]?.judgmentQuality?.level).toBe("medium");
    expect(sample.qualityMeta?.todayCandidates.personalization?.dataBlockerCount).toBe(1);
    expect(sample.qualityMeta?.todayCandidates.usCoverage?.status).toBe("degraded");
    expect(sample.qualityMeta?.todayCandidates.usCandidateDiagnostics?.status).toBe("degraded");
    expect(sample.qualityMeta?.todayCandidates.feedbackSummary).toBeDefined();
    expect(sample.qualityMeta?.todayCandidates.concentrationRiskSummary).toBeDefined();
    expect(sample.qualityMeta?.todayCandidates.themeConnectionSummary).toBeDefined();
    expect(sample.qualityMeta?.todayCandidates.usMappingBridgeDiagnostics?.readOnly).toBe(true);
    expect(JSON.stringify(sample)).not.toMatch(/자동매매|자동 주문 실행|자동 리밸런싱|즉시\s*매수|즉시\s*매도/);
  });
});
