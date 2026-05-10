import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  insertSpy: vi.fn(),
  sampleBroad: [
    {
      id: "a",
      user_key: "test-user-key",
      event_type: "info",
      severity: "info",
      domain: "research_center",
      route: "/api/research-center/generate",
      component: "research-center",
      message: "started",
      code: "research_report_generation_started",
      status: "open",
      action_hint: null,
      detail: { stage: "request", requestId: "trace-req-1" },
      fingerprint: "fp",
      occurrence_count: 1,
      first_seen_at: "2026-05-08T00:00:00.000Z",
      last_seen_at: "2026-05-08T00:01:00.000Z",
      resolved_at: null,
      resolution_note: null,
      created_at: "2026-05-08T00:00:00.000Z",
      updated_at: "2026-05-08T00:01:00.000Z",
    },
  ],
}));

vi.mock("@/lib/server/persona-chat-auth", () => ({
  requirePersonaChatAuth: vi.fn(async () => ({ ok: true as const, userKey: "test-user-key" })),
}));

vi.mock("@/lib/server/supabase-service", () => ({
  getServiceSupabase: vi.fn(() => {
    let fromCalls = 0;
    return {
      from: vi.fn(() => {
        fromCalls += 1;
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain.eq = vi.fn(function eqFn() {
          return chain;
        });
        chain.gte = vi.fn(function gteFn() {
          return chain;
        });
        chain.filter = vi.fn(function filterFn() {
          return chain;
        });
        chain.order = vi.fn(function orderFn() {
          return {
            limit: vi.fn(() =>
              Promise.resolve({
                data: fromCalls === 1 ? [] : mocks.sampleBroad,
                error: null,
              }),
            ),
          };
        });
        return {
          select: vi.fn(() => chain),
          insert: mocks.insertSpy,
        };
      }),
    };
  }),
}));

describe("GET /api/research-center/ops-trace", () => {
  beforeEach(() => {
    mocks.insertSpy.mockClear();
  });

  it("matches requestId in detail via broad scan and does not insert", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      new Request("http://local/api/research-center/ops-trace?requestId=trace-req-1&range=24h"),
    );
    const json = (await res.json()) as { found: boolean; timeline: { length: number } };
    expect(json.found).toBe(true);
    expect(json.timeline.length).toBeGreaterThan(0);
    expect(mocks.insertSpy).not.toHaveBeenCalled();
  });
});
