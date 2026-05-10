import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  insertSpy: vi.fn(),
  sampleRows: [
    {
      severity: "error",
      code: "research_report_generation_failed",
      status: "open",
      occurrence_count: 2,
      first_seen_at: "2026-05-08T00:00:00.000Z",
      last_seen_at: "2026-05-08T00:01:00.000Z",
      message: "generation failed",
      fingerprint: "fp1",
      detail: { stage: "provider", requestId: "rid-search" },
    },
    {
      severity: "warning",
      code: "research_report_degraded",
      status: "open",
      occurrence_count: 1,
      first_seen_at: "2026-05-08T00:00:00.000Z",
      last_seen_at: "2026-05-08T00:02:00.000Z",
      message: "degraded path",
      fingerprint: "fp2",
      detail: { stage: "sheets", requestId: "rid-other" },
    },
  ],
}));

vi.mock("@/lib/server/persona-chat-auth", () => ({
  requirePersonaChatAuth: vi.fn(async () => ({ ok: true as const, userKey: "test-user-key" })),
}));

vi.mock("@/lib/server/supabase-service", () => ({
  getServiceSupabase: vi.fn(() => {
    const chain = {
      eq: vi.fn(function eqFn(this: typeof chain) {
        return this;
      }),
      filter: vi.fn(function filterFn(this: typeof chain) {
        return this;
      }),
      gte: vi.fn(function gteFn(this: typeof chain) {
        return this;
      }),
      order: vi.fn(function orderFn(this: typeof chain) {
        return this;
      }),
      limit: vi.fn(async () => ({ data: mocks.sampleRows, error: null })),
    };
    return {
      from: vi.fn(() => ({
        select: vi.fn(() => chain),
        insert: mocks.insertSpy,
      })),
    };
  }),
}));

describe("GET /api/research-center/ops-summary", () => {
  beforeEach(() => {
    mocks.insertSpy.mockClear();
  });

  it("aggregates rows via SELECT only (no insert)", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://local/api/research-center/ops-summary?range=24h"));
    expect(res.ok).toBe(true);
    const json = (await res.json()) as {
      ok: boolean;
      summary: { totalEvents: number; topEventCodes: Array<{ code: string; count: number }> };
    };
    expect(json.ok).toBe(true);
    expect(json.summary.totalEvents).toBe(2);
    expect(json.summary.topEventCodes.find((x) => x.code === "research_report_generation_failed")?.count).toBe(2);
    expect(mocks.insertSpy).not.toHaveBeenCalled();
  });

  it("reports requestId hit counts when filtering", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      new Request(
        "http://local/api/research-center/ops-summary?range=24h&requestId=" +
          encodeURIComponent("rid-search"),
      ),
    );
    const json = (await res.json()) as {
      ok: boolean;
      summary: { requestIdHit?: { requestId: string; count: number } };
    };
    expect(json.ok).toBe(true);
    expect(json.summary.requestIdHit?.requestId).toBe("rid-search");
    expect(json.summary.requestIdHit?.count).toBe(2);
  });
});
