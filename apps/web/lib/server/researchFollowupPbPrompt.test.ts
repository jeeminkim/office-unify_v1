import { describe, expect, it } from "vitest";
import { buildResearchFollowupPrivateBankerPrompt } from "./researchFollowupPbPrompt";
import type { ResearchFollowupItem } from "@office-unify/shared-types";

const fu: ResearchFollowupItem = {
  id: "1",
  title: "Check",
  detailBullets: [],
  sourceSection: "s",
  priority: "medium",
  category: "other",
  extractedAt: "",
};

describe("buildResearchFollowupPrivateBankerPrompt", () => {
  it("includes suitability section and investor profile block", () => {
    const p = buildResearchFollowupPrivateBankerPrompt({
      companyName: "ACME",
      conclusionSummaryLines: [],
      followups: [fu],
      investorProfileSection: "[투자자 프로필 맥락 요약]",
    });
    expect(p).toContain("[사용자 적합성 점검]");
    expect(p).toContain("[투자자 프로필 맥락 요약]");
    expect(p).toContain("[행동 분류]");
    expect(p).not.toMatch(/자동\s*포트폴리오/i);
  });

  it("default profile placeholder does not imply execution", () => {
    const p = buildResearchFollowupPrivateBankerPrompt({
      conclusionSummaryLines: [],
      followups: [fu],
    });
    expect(p).toContain("[사용자 적합성 점검]");
    expect(p).toContain("자동 주문");
  });

  it("includes optional concentration section without autotrade execution wording in body", () => {
    const conc = `[보유 집중도 점검]
- 데이터: 부분 데이터 기준
- 질문형 응답 유도`;
    const p = buildResearchFollowupPrivateBankerPrompt({
      conclusionSummaryLines: [],
      followups: [fu],
      investorProfileSection: "[프로필]",
      concentrationRiskSection: conc,
    });
    expect(p).toContain("[보유 집중도");
    expect(p).toContain("[프로필]");
    expect(p).toContain("질문형");
  });
});
