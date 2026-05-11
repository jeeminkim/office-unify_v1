import { describe, expect, it } from "vitest";
import {
  normalizeInvestorProfile,
  sanitizeInvestorProfileNotes,
  computeProfileStatus,
} from "./investorProfile";
import {
  investorProfileTableMissingJson,
  isInvestorProfileTableMissingError,
} from "./investorProfileSupabaseErrors";

describe("investorProfile", () => {
  it("normalizes enums and defaults unknown", () => {
    const p = normalizeInvestorProfile({
      risk_tolerance: "bogus",
      time_horizon: "mid",
      leverage_policy: "limited",
      concentration_limit: "moderate",
      preferred_sectors: ["반도체"],
      avoid_sectors: null,
      notes: null,
    });
    expect(p.riskTolerance).toBe("unknown");
    expect(p.timeHorizon).toBe("mid");
    expect(p.leveragePolicy).toBe("limited");
    expect(p.concentrationLimit).toBe("moderate");
    expect(p.preferredSectors).toEqual(["반도체"]);
  });

  it("sanitizes notes length and control chars", () => {
    expect(sanitizeInvestorProfileNotes("a\u0000b".repeat(3000))?.length).toBeLessThanOrEqual(2000);
    expect(sanitizeInvestorProfileNotes("   ")).toBeUndefined();
  });

  it("computeProfileStatus complete when core filled", () => {
    expect(
      computeProfileStatus(
        normalizeInvestorProfile({
          risk_tolerance: "low",
          time_horizon: "long",
          leverage_policy: "not_allowed",
          concentration_limit: "strict",
        }),
      ),
    ).toBe("complete");
  });

  it("detects investor profile table missing error", () => {
    expect(isInvestorProfileTableMissingError({ code: "42P01", message: "x" })).toBe(true);
    expect(investorProfileTableMissingJson().code).toBe("investor_profile_table_missing");
    expect(investorProfileTableMissingJson().actionHint).toContain("append_investor_profile.sql");
  });
});
