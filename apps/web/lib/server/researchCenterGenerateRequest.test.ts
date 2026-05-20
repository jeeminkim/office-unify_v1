import { describe, expect, it } from "vitest";
import {
  normalizeResearchDesksList,
  parseResearchCenterGenerateBody,
  RESEARCH_DESK_IDS,
} from "./researchCenterGenerateRequest";

describe("researchCenterGenerateRequest", () => {
  it("parses a minimal valid request and trims identity fields", () => {
    const body = parseResearchCenterGenerateBody({
      market: "KR",
      symbol: " 005930 ",
      name: " 삼성전자 ",
      includeSheetContext: true,
      saveToSheets: false,
    });
    expect(body).toMatchObject({
      market: "KR",
      symbol: "005930",
      name: "삼성전자",
      includeSheetContext: true,
      saveToSheets: false,
      selectedDesks: "all",
    });
  });

  it("filters selected desks and falls back to all when none are valid", () => {
    expect(
      parseResearchCenterGenerateBody({
        market: "US",
        symbol: "AAPL",
        name: "Apple",
        selectedDesks: ["blackrock_quality", "unknown"],
      })?.selectedDesks,
    ).toEqual(["blackrock_quality"]);

    expect(
      parseResearchCenterGenerateBody({
        market: "US",
        symbol: "AAPL",
        name: "Apple",
        selectedDesks: ["unknown"],
      })?.selectedDesks,
    ).toBe("all");
  });

  it("rejects invalid tone or missing required fields", () => {
    expect(parseResearchCenterGenerateBody({ market: "US", symbol: "AAPL", name: "Apple", toneMode: "loud" })).toBeNull();
    expect(parseResearchCenterGenerateBody({ market: "US", symbol: "", name: "Apple" })).toBeNull();
  });

  it("normalizes all desk selections", () => {
    expect(normalizeResearchDesksList("all")).toEqual([...RESEARCH_DESK_IDS]);
    expect(normalizeResearchDesksList(["hindenburg_short"])).toEqual(["hindenburg_short"]);
  });
});
