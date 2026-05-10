import { describe, expect, it } from "vitest";
import {
  extractResearchFollowupSection,
  parseResearchFollowupItemsFromMarkdown,
} from "./researchCenterFollowups";

const md = `
## 요약
텍스트

## 다음에 확인할 것
1. MSD 계약 진행
2. 경쟁사 파이프라인
- 부채 비율 추이

## 다른 섹션
끝
`;

describe("researchCenterFollowups", () => {
  it("extracts section body", () => {
    const s = extractResearchFollowupSection(md);
    expect(s).toContain("MSD 계약");
    expect(s).not.toContain("다른 섹션");
  });

  it("parses numbered and bullet lists", () => {
    const items = parseResearchFollowupItemsFromMarkdown(md, "2026-01-01T00:00:00.000Z");
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.some((x) => x.title.includes("MSD"))).toBe(true);
  });

  it("handles Follow-up heading", () => {
    const m = "## Follow-up\n1. 임상 결과\n";
    const items = parseResearchFollowupItemsFromMarkdown(m, "2026-01-01T00:00:00.000Z");
    expect(items.length).toBe(1);
    expect(items[0].category).toBe("pipeline");
  });

  it("returns empty when no section", () => {
    expect(parseResearchFollowupItemsFromMarkdown("# hello", "t")).toEqual([]);
  });
});
