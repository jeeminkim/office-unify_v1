import { describe, expect, it } from "vitest";
import { gatingReasonCopy } from "./UsDiagnosticsCard";

describe("gatingReasonCopy", () => {
  it("does not use sheets_anchor_zero copy for anchor-ok follow-up states", () => {
    expect(gatingReasonCopy("sheets_anchor_ok_but_us_signal_empty")).toContain("미국 anchor는 정상");
    expect(gatingReasonCopy("us_signal_mapping_empty")).toContain("미국 신호는 있으나");
    expect(gatingReasonCopy("gating_not_connected")).toContain("Today Brief gating");
  });

  it("keeps sheets_anchor_zero distinct", () => {
    expect(gatingReasonCopy("sheets_anchor_zero")).toContain("anchor가 0");
  });
});
