import { describe, expect, it } from "vitest";
import { OPS_LOG_MAX_WRITES_PER_REQUEST, shouldWriteOpsEvent } from "./opsLogBudget";

describe("opsLogBudget", () => {
  it("skips warning logs on read-only route", () => {
    const d = shouldWriteOpsEvent({
      domain: "today_candidates",
      code: "today_candidates_us_market_no_data",
      severity: "warning",
      fingerprint: "f1",
      isReadOnlyRoute: true,
      cooldownMinutes: 30,
    });
    expect(d.shouldWrite).toBe(false);
    expect(d.reason).toBe("skipped_read_only");
  });

  it("allows explicit refresh writes", () => {
    const d = shouldWriteOpsEvent({
      domain: "sector_radar",
      code: "sector_radar_score_no_data",
      severity: "warning",
      fingerprint: "f1",
      isReadOnlyRoute: true,
      isExplicitRefresh: true,
      cooldownMinutes: 30,
    });
    expect(d.shouldWrite).toBe(true);
    expect(d.reason).toBe("explicit_refresh");
  });

  it("skips repeated writes within cooldown", () => {
    const now = new Date("2026-05-07T00:00:00.000Z");
    const d = shouldWriteOpsEvent({
      domain: "sector_radar",
      code: "sector_radar_score_no_data",
      severity: "warning",
      fingerprint: "f1",
      lastSeenAt: "2026-05-06T23:50:00.000Z",
      cooldownMinutes: 30,
      now,
    });
    expect(d.shouldWrite).toBe(false);
    expect(d.reason).toBe("skipped_cooldown");
  });

  it("enforces request write budget limit", () => {
    const d = shouldWriteOpsEvent({
      domain: "sector_radar",
      code: "sector_radar_score_no_data",
      severity: "warning",
      fingerprint: "f1",
      writesUsed: OPS_LOG_MAX_WRITES_PER_REQUEST,
      cooldownMinutes: 30,
    });
    expect(d.shouldWrite).toBe(false);
    expect(d.reason).toBe("skipped_budget_exceeded");
  });
});
