import { describe, expect, it } from "vitest";
import {
  appendQualityMetaOpsEventTrace,
  OPS_LOG_MAX_WRITES_PER_REQUEST,
  shouldWriteOpsEvent,
  type OpsQualityMetaEventTraceEntry,
} from "./opsLogBudget";

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

  it("allows explicit refresh writes (still respects budget first)", () => {
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

  it("skips read-only + isCritical when code is not whitelisted", () => {
    const d = shouldWriteOpsEvent({
      domain: "sector_radar",
      code: "sector_radar_score_no_data",
      severity: "warning",
      fingerprint: "f1",
      isReadOnlyRoute: true,
      isCritical: true,
      cooldownMinutes: 30,
    });
    expect(d.shouldWrite).toBe(false);
    expect(d.reason).toBe("skipped_read_only");
  });

  it("allows read-only + isCritical + whitelist on first_seen (not blanket critical_error)", () => {
    const d = shouldWriteOpsEvent({
      domain: "sector_radar",
      code: "sector_radar_summary_batch_degraded",
      severity: "warning",
      fingerprint: "f-critical",
      isReadOnlyRoute: true,
      isCritical: true,
      cooldownMinutes: 30,
    });
    expect(d.shouldWrite).toBe(true);
    expect(d.reason).toBe("first_seen");
  });

  it("read-only + whitelist + isCritical respects cooldown", () => {
    const now = new Date("2026-05-07T00:00:00.000Z");
    const d = shouldWriteOpsEvent({
      domain: "today_candidates",
      code: "today_candidates_summary_batch_degraded",
      severity: "warning",
      fingerprint: "f1",
      isReadOnlyRoute: true,
      isCritical: true,
      lastSeenAt: "2026-05-06T23:50:00.000Z",
      cooldownMinutes: 30,
      now,
    });
    expect(d.shouldWrite).toBe(false);
    expect(d.reason).toBe("skipped_cooldown");
  });

  it("read-only + whitelist + isCritical respects budget", () => {
    const d = shouldWriteOpsEvent({
      domain: "today_candidates",
      code: "today_candidates_us_market_no_data",
      severity: "warning",
      fingerprint: "f1",
      isReadOnlyRoute: true,
      isCritical: true,
      writesUsed: OPS_LOG_MAX_WRITES_PER_REQUEST,
      cooldownMinutes: 30,
    });
    expect(d.shouldWrite).toBe(false);
    expect(d.reason).toBe("skipped_budget_exceeded");
  });

  it("severity error bypasses read-only whitelist gate", () => {
    const d = shouldWriteOpsEvent({
      domain: "sector_radar",
      code: "any_non_whitelisted_code",
      severity: "error",
      fingerprint: "f1",
      isReadOnlyRoute: true,
      cooldownMinutes: 30,
    });
    expect(d.shouldWrite).toBe(true);
    expect(d.reason).toBe("critical_error");
  });

  it("skips repeated writes within cooldown (non-read-only path)", () => {
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

  it("appendQualityMetaOpsEventTrace caps entries", () => {
    const opsLogging: { eventTrace?: OpsQualityMetaEventTraceEntry[] } = {};
    for (let i = 0; i < 40; i += 1) {
      appendQualityMetaOpsEventTrace(
        opsLogging,
        { code: `c${i}`, shouldWrite: true, reason: "first_seen" },
        3,
      );
    }
    expect(opsLogging.eventTrace?.length).toBe(3);
  });
});
