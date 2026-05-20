import { describe, expect, it } from "vitest";
import {
  hasConfirmableGoogleFinanceRepairOperation,
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
});
