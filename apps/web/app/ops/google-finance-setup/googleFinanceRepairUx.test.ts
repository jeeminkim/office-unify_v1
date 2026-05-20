import { describe, expect, it } from "vitest";
import {
  hasConfirmableGoogleFinanceRepairOperation,
  resolveGoogleFinanceAnchorCtaState,
  resolveGoogleFinanceRepairDisabledReason,
} from "./googleFinanceRepairUx";

describe("googleFinanceRepairUx", () => {
  it("explains unsafe-only repair plans in user-facing language", () => {
    const reason = resolveGoogleFinanceRepairDisabledReason({
      writeAvailable: true,
      status: "unsafe",
      operations: [{ type: "overwrite_existing_rows", riskLevel: "high" }],
    });

    expect(reason).toContain("기존 데이터가 있어 자동 덮어쓰기를 막았습니다");
  });

  it("keeps low-risk formula fills enabled even when the plan status is unsafe", () => {
    const plan = {
      writeAvailable: true,
      status: "unsafe",
      operations: [{ type: "fill_missing_anchor_formulas", riskLevel: "low" }],
    };

    expect(hasConfirmableGoogleFinanceRepairOperation(plan)).toBe(true);
    expect(resolveGoogleFinanceRepairDisabledReason(plan)).toBeNull();
  });

  it("does not enable no-op repair plans", () => {
    expect(
      resolveGoogleFinanceRepairDisabledReason({
        writeAvailable: true,
        status: "ok",
        operations: [{ type: "no_op", riskLevel: "low" }],
      }),
    ).toContain("적용할 안전 보강 작업이 없습니다");
  });

  it("treats anchorOk as a completed state and hides the repair CTA", () => {
    const state = resolveGoogleFinanceAnchorCtaState({
      anchorOk: 16,
      anchorMatched: 16,
      parsedRowsOk: 23,
      missingAnchors: [],
      repairPlan: { writeAvailable: true, status: "unsafe", operations: [] },
    });

    expect(state.kind).toBe("anchor_ok");
    expect(state.showRepairCta).toBe(false);
    expect(state.emphasizeTodayBrief).toBe(true);
    expect(state.repairCtaDisabledReason).toContain("이미 Google Finance anchor가 확인되었습니다");
  });

  it("shows repair CTA when anchorOk is zero and anchors are missing", () => {
    const state = resolveGoogleFinanceAnchorCtaState({
      anchorOk: 0,
      anchorMatched: 0,
      parsedRowsOk: 3,
      missingAnchors: ["SPY"],
      repairPlan: {
        writeAvailable: true,
        status: "repairable",
        operations: [{ type: "append_missing_anchor_rows", riskLevel: "low" }],
      },
    });

    expect(state.kind).toBe("missing_anchors");
    expect(state.showRepairCta).toBe(true);
    expect(state.repairCtaDisabledReason).toBeNull();
  });

  it("separates unsafe-only from completed anchor state", () => {
    const state = resolveGoogleFinanceAnchorCtaState({
      anchorOk: 0,
      anchorMatched: 0,
      parsedRowsOk: 4,
      missingAnchors: [],
      repairPlan: {
        writeAvailable: true,
        status: "unsafe",
        operations: [{ type: "overwrite_existing_rows", riskLevel: "high" }],
      },
    });

    expect(state.kind).toBe("anchor_match_failed");
    expect(state.showRepairCta).toBe(false);
    expect(state.repairCtaDisabledReason).toContain("기존 데이터가 있어");
  });
});
