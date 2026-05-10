import { describe, expect, it } from "vitest";
import {
  buildResearchOpsFingerprint,
  isTransientResearchProviderError,
  runPromiseWithTimeout,
  toRequestId,
} from "./researchCenterRouteUtils";

describe("researchCenterRouteUtils", () => {
  it("generates stable requestId when missing", () => {
    expect(toRequestId(undefined)).toContain("rc_");
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

  it("detects transient provider errors", () => {
    expect(isTransientResearchProviderError(new Error("research_request_timeout:120000"))).toBe(true);
    expect(isTransientResearchProviderError(new Error("Unexpected token"))).toBe(false);
  });

  it("runPromiseWithTimeout rejects with bounded message", async () => {
    await expect(
      runPromiseWithTimeout(
        new Promise<string>(() => {
          /* never */
        }),
        20,
        "research_request_timeout:20",
      ),
    ).rejects.toThrow(/research_request_timeout/);
  });
});
