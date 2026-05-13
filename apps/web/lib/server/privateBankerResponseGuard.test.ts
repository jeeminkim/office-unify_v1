import { describe, expect, it } from "vitest";
import { auditPrivateBankerStructuredResponse, mergePbWeeklyReviewQualityMetaWithGuard } from "./privateBankerResponseGuard";

const sectionsOnly =
  "[행동 분류]\nx\n[정보 상태]\nx\n[사용자 적합성 점검]\nx\n[보유 집중도 점검]\nx\n[지금 해야 할 행동]\nx\n[하면 안 되는 행동]\nx\n[관찰해야 할 신호]\nx";

describe("privateBankerResponseGuard", () => {
  it("detects all required sections when present", () => {
    const g = auditPrivateBankerStructuredResponse(sectionsOnly);
    expect(g.missingSections).toEqual([]);
    expect(g.policyPhraseWarnings ?? []).toEqual([]);
  });

  it("records missing sections", () => {
    const g = auditPrivateBankerStructuredResponse("hello");
    expect(g.missingSections.length).toBeGreaterThan(0);
    expect(g.missingSections).toContain("[행동 분류]");
  });

  it("does not treat safe disclaimers as policy warnings", () => {
    const safe =
      `${sectionsOnly}\n[무효화 조건]\n자동 주문을 하지 않습니다. 자동 매매 권유가 아닙니다. 리밸런싱 실행하지 않습니다.`;
    const g = auditPrivateBankerStructuredResponse(safe);
    expect(g.policyPhraseWarnings ?? []).toEqual([]);
  });

  it("skips auto-order mention under [하면 안 되는 행동] list bullets", () => {
    const text = `${sectionsOnly}\n[하면 안 되는 행동]\n- 자동 주문\n- 주문 실행\n[무효화 조건]\n`;
    const g = auditPrivateBankerStructuredResponse(text);
    expect(g.policyPhraseWarnings ?? []).not.toContain("risky_auto_order_mention");
    expect(g.policyPhraseWarnings ?? []).not.toContain("risky_order_execution_mention");
  });

  it("flags imperative buy/sell/rebalance phrasing", () => {
    expect(auditPrivateBankerStructuredResponse(`${sectionsOnly}\n매수하세요`).policyPhraseWarnings).toContain(
      "imperative_buy_instruction",
    );
    expect(auditPrivateBankerStructuredResponse(`${sectionsOnly}\n매도하세요`).policyPhraseWarnings).toContain(
      "imperative_sell_instruction",
    );
    expect(auditPrivateBankerStructuredResponse(`${sectionsOnly}\n비중을 줄이세요`).policyPhraseWarnings).toContain(
      "imperative_reduce_weight",
    );
    expect(auditPrivateBankerStructuredResponse(`${sectionsOnly}\n리밸런싱하세요`).policyPhraseWarnings).toContain(
      "imperative_rebalance",
    );
  });

  it("flags risky auto order when not negated and not a forbidden-section bullet", () => {
    const g = auditPrivateBankerStructuredResponse(`${sectionsOnly}\n앱에서 자동 주문 파이프라인을 켜 두세요.`);
    expect(g.policyPhraseWarnings).toContain("risky_auto_order_mention");
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
