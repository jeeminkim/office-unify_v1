import { describe, expect, it } from "vitest";
import type { WebOpsEventRow } from "@office-unify/supabase-access";
import { summarizeResearchCenterOps } from "./researchCenterOpsSummary";

const base = {
  id: "1",
  user_key: "u1",
  event_type: "warning",
  severity: "warning",
  domain: "research_center",
  route: "/api/research-center/generate",
  component: "research-center",
  status: "open",
  action_hint: null,
  fingerprint: "f1",
  first_seen_at: "2026-05-08T00:00:00.000Z",
  created_at: "2026-05-08T00:00:00.000Z",
  updated_at: "2026-05-08T00:00:00.000Z",
  resolved_at: null,
  note: null,
} as const;

describe("researchCenterOpsSummary", () => {
  it("aggregates event code and failed stage counts", () => {
    const rows: WebOpsEventRow[] = [
      {
        ...base,
        code: "research_report_generation_failed",
        message: "failed",
        detail: { stage: "provider", requestId: "r1" },
        occurrence_count: 2,
        last_seen_at: "2026-05-08T00:01:00.000Z",
      },
      {
        ...base,
        id: "2",
        code: "research_report_degraded",
        message: "degraded",
        detail: { stage: "sheets", requestId: "r2", api_key: "secret" },
        occurrence_count: 1,
        last_seen_at: "2026-05-08T00:02:00.000Z",
      },
    ];
    const out = summarizeResearchCenterOps(rows, "24h");
    expect(out.summary.topEventCodes[0]?.code).toBe("research_report_generation_failed");
    expect(out.summary.failedStageCounts.provider).toBe(2);
    expect(out.summary.failedStageCounts.sheets).toBe(1);
    expect(out.summary.degradedCount).toBe(1);
  });

  it("supports requestId filter hit reporting", () => {
    const rows: WebOpsEventRow[] = [
      {
        ...base,
        code: "research_report_generation_completed",
        message: "ok",
        detail: { stage: "response", requestId: "req123" },
        occurrence_count: 3,
        last_seen_at: "2026-05-08T00:03:00.000Z",
      },
    ];
    const out = summarizeResearchCenterOps(rows, "7d", "req123");
    expect(out.summary.requestIdHit?.count).toBe(3);
  });

  it("computes failureCategories and ratios", () => {
    const rows: WebOpsEventRow[] = [
      {
        ...base,
        code: "research_report_generation_failed",
        severity: "error",
        message: "fail",
        detail: { stage: "timeout", requestId: "t1" },
        occurrence_count: 2,
        last_seen_at: "2026-05-08T00:04:00.000Z",
      },
      {
        ...base,
        id: "9",
        code: "trend_memory_compare_failed",
        severity: "warning",
        message: "compare",
        detail: { stage: "memory_compare", requestId: "t2" },
        occurrence_count: 1,
        last_seen_at: "2026-05-08T00:05:00.000Z",
      },
    ];
    const out = summarizeResearchCenterOps(rows, "24h");
    expect(out.summary.totalOccurrences).toBe(3);
    expect(out.summary.failureCategories.providerTimeout).toBe(2);
    expect(out.summary.failureCategories.memoryCompareRelated).toBe(1);
    expect(out.recentFailureEvents.length).toBeGreaterThan(0);
    expect(out.summary.recentRequestIds.length).toBeGreaterThan(0);
  });

  it("does not echo raw secret keys in recent event messages", () => {
    const rows: WebOpsEventRow[] = [
      {
        ...base,
        message: "ok",
        detail: { stage: "sheets", requestId: "r1" },
        last_seen_at: "2026-05-08T00:06:00.000Z",
      },
    ];
    const out = summarizeResearchCenterOps(rows, "24h");
    expect(out.recentEvents[0]?.message).not.toContain("secret");
  });
});
