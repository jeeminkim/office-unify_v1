import { describe, expect, it } from "vitest";
import { gatingReasonCopy, usSuppressReasonCopy } from "./UsDiagnosticsCard";

describe("gatingReasonCopy", () => {
  it("does not use sheets_anchor_zero copy for anchor-ok follow-up states", () => {
    expect(gatingReasonCopy("sheets_anchor_ok_but_us_signal_empty")).toContain("Google Finance anchor는 정상");
    expect(gatingReasonCopy("us_signal_mapping_empty")).toContain("Google Finance 문제가 아닙니다");
    expect(gatingReasonCopy("gating_not_connected")).toContain("Today Brief gating");
  });

  it("keeps sheets_anchor_zero distinct", () => {
    expect(gatingReasonCopy("sheets_anchor_zero")).toContain("anchor가 0");
  });

  it("maps suppressed reason codes into user-facing labels", () => {
    expect(usSuppressReasonCopy("deck_rank_lowered")).toContain("최종 후보에서 밀렸습니다");
    expect(usSuppressReasonCopy("low_confidence_mapping")).toContain("테마 연결 신뢰도");
    expect(usSuppressReasonCopy("quote_quality_low")).toContain("시세 품질");
  });
});
