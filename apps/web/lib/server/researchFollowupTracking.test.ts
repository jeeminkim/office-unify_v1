import { describe, expect, it } from "vitest";
import { normalizeResearchFollowupDedupeTitle } from "@office-unify/shared-types";
import { computeResearchFollowupSummary, sanitizeFollowupUserNote } from "./researchFollowupTracking";

describe("computeResearchFollowupSummary", () => {
  it("counts stale tracking (14d+) and pb linked", () => {
    const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const rows = [
      {
        status: "tracking",
        category: "other",
        priority: "medium",
        updated_at: old,
        selected_for_pb: false,
        pb_session_id: null,
        pb_turn_id: null,
      },
      {
        status: "open",
        category: "valuation",
        priority: "high",
        updated_at: new Date().toISOString(),
        selected_for_pb: true,
        pb_session_id: "s1",
        pb_turn_id: null,
      },
    ];
    const s = computeResearchFollowupSummary(rows);
    expect(s.staleTrackingCount).toBe(1);
    expect(s.pbLinkedCount).toBe(1);
    expect(s.statusCounts.open).toBe(1);
    expect(s.statusCounts.tracking).toBe(1);
    expect(s.categoryCounts.valuation).toBe(1);
  });
});

describe("sanitizeFollowupUserNote", () => {
  it("strips control chars and caps length", () => {
    expect(sanitizeFollowupUserNote("  ok  ")).toBe("ok");
    expect(sanitizeFollowupUserNote("\u0001x")).toBe("x");
  });
});

describe("normalizeResearchFollowupDedupeTitle", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeResearchFollowupDedupeTitle("  Foo   Bar  ")).toBe("foo bar");
    expect(normalizeResearchFollowupDedupeTitle("SAME")).toBe("same");
  });
});
