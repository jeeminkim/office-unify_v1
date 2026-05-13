import { describe, expect, it } from "vitest";
import { auditPrivateBankerStructuredResponse, mergePbWeeklyReviewQualityMetaWithGuard } from "./privateBankerResponseGuard";

const fullPb =
  "[행동 분류]\nx\n[정보 상태]\nx\n[사용자 적합성 점검]\nx\n[보유 집중도 점검]\nx\n[지금 해야 할 행동]\nx\n[하면 안 되는 행동]\n자동 주문·자동 매매·리밸런싱 없음\n[관찰해야 할 신호]\nx";

describe("privateBankerResponseGuard", () => {
  it("detects all required sections when present", () => {
    const g = auditPrivateBankerStructuredResponse(fullPb);
    expect(g.missingSections).toEqual([]);
    expect(g.policyPhraseWarnings ?? []).toEqual([]);
  });

  it("records missing sections", () => {
    const g = auditPrivateBankerStructuredResponse("hello");
    expect(g.missingSections.length).toBeGreaterThan(0);
    expect(g.missingSections).toContain("[행동 분류]");
  });

  it("warns when auto-trading / order disclaimers missing", () => {
    const partial =
      "[행동 분류]\n[정보 상태]\n[사용자 적합성 점검]\n[보유 집중도 점검]\n[지금 해야 할 행동]\n[하면 안 되는 행동]\n[관찰해야 할 신호]\n";
    const g = auditPrivateBankerStructuredResponse(partial);
    expect(g.policyPhraseWarnings?.length).toBeGreaterThan(0);
  });

  it("mergePbWeeklyReviewQualityMetaWithGuard nests under privateBanker.responseGuard", () => {
    const merged = mergePbWeeklyReviewQualityMetaWithGuard(
      {
        todayCandidateCount: 1,
        staleFollowupCount: 0,
        concentrationRiskCount: 0,
        suitabilityWarningCount: 0,
        dataQuality: "ok",
      },
      { missingSections: ["[행동 분류]"], policyPhraseWarnings: ["x"] },
    );
    expect(merged.privateBanker?.responseGuard?.missingSections).toEqual(["[행동 분류]"]);
    expect(merged.privateBanker?.responseGuard?.policyPhraseWarnings).toEqual(["x"]);
  });
});
