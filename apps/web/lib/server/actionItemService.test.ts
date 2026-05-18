import { describe, expect, it } from "vitest";
import {
  actionItemsFromCommitteeRoadmap,
  assertActionItemStatusTransition,
  buildActionItemSourceHref,
} from "./actionItemService";

describe("actionItemService", () => {
  it("builds source href for today candidate", () => {
    expect(
      buildActionItemSourceHref({
        sourceType: "today_candidate",
        sourceId: "cand-1",
      }),
    ).toBe("/?todayCandidate=cand-1");
  });

  it("allows open -> in_progress -> done", () => {
    expect(() => assertActionItemStatusTransition("open", "in_progress")).not.toThrow();
    expect(() => assertActionItemStatusTransition("in_progress", "done")).not.toThrow();
  });

  it("rejects done -> in_progress", () => {
    expect(() => assertActionItemStatusTransition("done", "in_progress")).toThrow(/invalid_status/);
  });

  it("maps committee roadmap items with idempotency keys", () => {
    const items = actionItemsFromCommitteeRoadmap({
      topic: "TSLA 집중도",
      committeeTurnId: "turn-1",
      items: [{ title: "포지션 비중 재확인", reason: "집중", bucket: "doThisWeek" }],
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.sourceType).toBe("committee_discussion");
    expect(items[0]?.idempotencyKey).toContain("turn-1");
    expect(items[0]?.links?.committeeTurnId).toBe("turn-1");
  });
});
