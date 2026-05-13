import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  insertSpy: vi.fn(),
  sampleRows: [
    {
      domain: "today_candidates",
      code: "us_signal_candidates_empty",
      occurrence_count: 2,
      last_seen_at: "2026-05-10T12:00:00.000Z",
      detail: { primaryReason: "usToKrMappingEmpty" },
    },
    {
      domain: "today_brief",
      code: "us_signal_candidates_empty",
      occurrence_count: 1,
      last_seen_at: "2026-05-09T08:00:00.000Z",
      detail: { reasonCodes: ["staleUsData"] },
    },
  ],
}));

vi.mock("@/lib/server/persona-chat-auth", () => ({
  requirePersonaChatAuth: vi.fn(async () => ({ ok: true as const, userKey: "u1" })),
}));

vi.mock("@/lib/server/supabase-service", () => ({
  getServiceSupabase: vi.fn(() => {
    const chain = {
      in: vi.fn(function inFn(this: typeof chain) {
        return this;
      }),
      eq: vi.fn(function eqFn(this: typeof chain) {
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

describe("GET /api/dashboard/today-candidates/ops-summary", () => {
  beforeEach(() => {
    mocks.insertSpy.mockClear();
  });

  it("returns histogram and does not call insert on success path", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://local/api/dashboard/today-candidates/ops-summary?range=7d"));
    expect(res.ok).toBe(true);
    const json = (await res.json()) as {
      ok: boolean;
      usKrEmptyReasonHistogram: Array<{ reason: string; count: number }>;
      qualityMeta?: { todayCandidates?: { usKrEmptyReasonHistogram?: { totalCount: number; items: unknown[] } } };
    };
    expect(json.ok).toBe(true);
    expect(json.qualityMeta?.todayCandidates?.usKrEmptyReasonHistogram?.totalCount).toBe(3);
    expect(mocks.insertSpy).not.toHaveBeenCalled();
  });
});
