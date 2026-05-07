import { describe, expect, it } from "vitest";
import {
  buildResearchOpsFingerprint,
  classifyResearchFailureStage,
  toResearchErrorCode,
} from "./researchCenterRouteUtils";

describe("researchCenterRouteUtils", () => {
  it("classifies provider timeout failure", () => {
    expect(classifyResearchFailureStage(new Error("Gemini timeout aborted"))).toBe("provider");
  });

  it("classifies response parse failure", () => {
    expect(classifyResearchFailureStage(new Error("json parse failed"))).toBe("response_parse");
  });

  it("maps stage to stable error code", () => {
    expect(toResearchErrorCode("context_cache")).toBe("research_context_cache_save_failed");
  });

  it("builds stable research fingerprint format", () => {
    expect(
      buildResearchOpsFingerprint({
        userKey: "u1",
        ymdKst: "20260508",
        eventCode: "trend_memory_compare_failed",
      }),
    ).toBe("research_center:u1:20260508:trend_memory_compare_failed");
  });
});
