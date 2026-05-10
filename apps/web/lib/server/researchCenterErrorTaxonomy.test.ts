import { describe, expect, it } from "vitest";
import { RESEARCH_CENTER_ERROR_CODE } from "@office-unify/shared-types";
import {
  classifyResearchCenterError,
  mapStageToResearchErrorCode,
  sanitizeResearchErrorDetail,
  toResearchActionHint,
  toUserActionHint,
} from "./researchCenterErrorTaxonomy";

describe("researchCenterErrorTaxonomy", () => {
  it("maps provider timeout correctly", () => {
    const stage = classifyResearchCenterError(new Error("provider timeout aborted"));
    expect(stage).toBe("timeout");
    expect(mapStageToResearchErrorCode(stage)).toBe(RESEARCH_CENTER_ERROR_CODE.PROVIDER_TIMEOUT);
  });

  it("maps provider call failure to research_provider_call_failed", () => {
    const stage = classifyResearchCenterError(new Error("gemini provider rejected request"));
    expect(mapStageToResearchErrorCode(stage)).toBe(RESEARCH_CENTER_ERROR_CODE.PROVIDER_CALL_FAILED);
  });

  it("maps sheets and parse failures", () => {
    expect(mapStageToResearchErrorCode(classifyResearchCenterError(new Error("sheets append failed")))).toBe(
      RESEARCH_CENTER_ERROR_CODE.SHEETS_SAVE_FAILED,
    );
    expect(mapStageToResearchErrorCode(classifyResearchCenterError(new Error("response parse failed")))).toBe(
      RESEARCH_CENTER_ERROR_CODE.RESPONSE_PARSE_FAILED,
    );
    expect(mapStageToResearchErrorCode(classifyResearchCenterError(new Error("Unexpected token in JSON at 1:1")))).toBe(
      RESEARCH_CENTER_ERROR_CODE.RESPONSE_PARSE_FAILED,
    );
  });

  it("toUserActionHint is an alias of toResearchActionHint", () => {
    expect(toUserActionHint(RESEARCH_CENTER_ERROR_CODE.PROVIDER_CALL_FAILED)).toBe(
      toResearchActionHint(RESEARCH_CENTER_ERROR_CODE.PROVIDER_CALL_FAILED),
    );
  });

  it("returns action hint by error code", () => {
    expect(toResearchActionHint("research_provider_call_failed")).toContain("provider");
    expect(toResearchActionHint(RESEARCH_CENTER_ERROR_CODE.OPS_LOGGING_FAILED)).toContain("운영 로그");
  });

  it("sanitizes sensitive fields in detail", () => {
    const safe = sanitizeResearchErrorDetail({
      token: "abc",
      promptText: "very long prompt body",
      message: "plain",
      openai_apikey: "x",
      secret_key: "z",
    });
    expect(safe?.token).toBe("[redacted]");
    expect(safe?.promptText).toBe("[redacted]");
    expect(safe?.message).toBe("plain");
    expect(safe?.openai_apikey).toBe("[redacted]");
    expect(safe?.secret_key).toBe("[redacted]");
  });

  it("maps unknown stage to research_unknown_failed hint", () => {
    expect(mapStageToResearchErrorCode(classifyResearchCenterError(new Error("something odd")))).toBe(
      RESEARCH_CENTER_ERROR_CODE.UNKNOWN_FAILED,
    );
    expect(toResearchActionHint(RESEARCH_CENTER_ERROR_CODE.UNKNOWN_FAILED)).toContain("requestId");
  });

  it("uses explicit stage hint when provided", () => {
    expect(classifyResearchCenterError(new Error("x"), "memory_compare")).toBe("memory_compare");
    expect(mapStageToResearchErrorCode("memory_compare")).toBe(RESEARCH_CENTER_ERROR_CODE.MEMORY_COMPARE_FAILED);
  });
});
