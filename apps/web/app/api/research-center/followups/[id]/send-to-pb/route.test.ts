import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  getServiceSupabase: vi.fn(),
  runPb: vi.fn(),
}));

vi.mock("@/lib/server/persona-chat-auth", () => ({
  requirePersonaChatAuth: vi.fn(async () => ({ ok: true as const, userKey: "u-test" })),
}));

vi.mock("@/lib/server/supabase-service", () => ({
  getServiceSupabase: hoisted.getServiceSupabase,
}));

vi.mock("@/lib/server/runPrivateBankerMessage", () => ({
  buildPrivateBankerContentHash: vi.fn(() => "hash-1"),
  runPrivateBankerMessageWithDbIdempotency: hoisted.runPb,
}));

vi.mock("@/lib/server/investorProfile", () => ({
  getInvestorProfileForUser: vi.fn(async () => ({
    ok: true as const,
    profile: null,
    profileStatus: "missing" as const,
  })),
}));

vi.mock("@/lib/server/researchFollowupOps", () => ({
  logResearchFollowupOpsEvent: vi.fn(async () => {}),
}));

describe("POST /api/research-center/followups/[id]/send-to-pb", () => {
  beforeEach(() => {
    hoisted.getServiceSupabase.mockReset();
    hoisted.runPb.mockReset();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("GEMINI_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 404 when follow-up row is absent", async () => {
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(function eqChain(this: unknown) {
            return {
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
              })),
            };
          }),
        })),
      })),
    });
    hoisted.runPb.mockResolvedValue({
      kind: "ok",
      deduplicated: false,
      body: {
        assistantMessage: { id: "a1", content: "x" },
        userMessage: { id: "u1" },
      },
    });
    const { POST } = await import("./route");
    const res = await POST(new Request("http://local/x", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ id: "missing-id" }),
    });
    expect(res.status).toBe(404);
  });

  it("runs PB idempotency and updates row", async () => {
    const row = {
      id: "fu-1",
      title: "Follow A",
      detail_json: { followupId: "x", bullets: ["b1"] },
      symbol: "005930",
      company_name: "삼성",
      category: "other",
      priority: "medium",
      created_at: new Date().toISOString(),
    };
    const updateMock = vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })) }));
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "web_research_followup_items") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
                })),
              })),
            })),
            update: updateMock,
          };
        }
        if (table === "web_portfolio_holdings") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  order: vi.fn(() => Promise.resolve({ data: [], error: null })),
                })),
              })),
            })),
          };
        }
        return {};
      }),
    });
    hoisted.runPb.mockResolvedValue({
      kind: "ok",
      deduplicated: false,
      body: {
        assistantMessage: { id: "asst-9", content: "pb reply text ".repeat(20) },
        userMessage: { id: "usr-8" },
      },
    });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://local/x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: "idem-1", conclusionSummaryLines: ["요약"] }),
      }),
      { params: Promise.resolve({ id: "fu-1" }) },
    );
    expect(res.ok).toBe(true);
    expect(hoisted.runPb).toHaveBeenCalled();
    const pbArg = hoisted.runPb.mock.calls[0]?.[0] as { content: string };
    expect(pbArg.content).toContain("Follow A");
    expect(pbArg.content).toContain("삼성");
    expect(pbArg.content).toContain("[보유 집중도");
    expect(updateMock).toHaveBeenCalled();
    const upPayload = updateMock.mock.calls[0]?.[0] as {
      selected_for_pb: boolean;
      status: string;
      pb_turn_id: string | null;
      pb_session_id: string | null;
    };
    expect(upPayload.selected_for_pb).toBe(true);
    expect(upPayload.status).toBe("discussed");
    expect(upPayload.pb_turn_id).toBe("asst-9");
    expect(upPayload.pb_session_id).toBe("usr-8");
    const json = (await res.json()) as { ok: boolean; pb?: { deduplicated: boolean }; followup?: { status?: string } };
    expect(json.ok).toBe(true);
    expect(json.pb?.deduplicated).toBe(false);
    expect(json.followup?.status).toBe("discussed");
  });

  it("sets status tracking when PB reply was deduplicated", async () => {
    const row = {
      id: "fu-2",
      title: "Follow B",
      detail_json: { bullets: [] },
      symbol: null,
      company_name: null,
      category: "other",
      priority: "medium",
      created_at: new Date().toISOString(),
    };
    const updateMock = vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })) }));
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "web_research_followup_items") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
                })),
              })),
            })),
            update: updateMock,
          };
        }
        if (table === "web_portfolio_holdings") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  order: vi.fn(() => Promise.resolve({ data: [], error: null })),
                })),
              })),
            })),
          };
        }
        return {};
      }),
    });
    hoisted.runPb.mockResolvedValue({
      kind: "ok",
      deduplicated: true,
      body: {
        assistantMessage: { id: "asst-d", content: "cached" },
        userMessage: { id: "usr-d" },
      },
    });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://local/x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: "idem-dup" }),
      }),
      { params: Promise.resolve({ id: "fu-2" }) },
    );
    expect(res.ok).toBe(true);
    const upPayload = updateMock.mock.calls[0]?.[0] as { status: string };
    expect(upPayload.status).toBe("tracking");
  });

  it("does not update row when PB run fails", async () => {
    const row = {
      id: "fu-3",
      title: "Follow C",
      detail_json: {},
      symbol: null,
      company_name: null,
      category: "other",
      priority: "medium",
      created_at: new Date().toISOString(),
    };
    const updateMock = vi.fn();
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "web_research_followup_items") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
                })),
              })),
            })),
            update: updateMock,
          };
        }
        if (table === "web_portfolio_holdings") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  order: vi.fn(() => Promise.resolve({ data: [], error: null })),
                })),
              })),
            })),
          };
        }
        return {};
      }),
    });
    hoisted.runPb.mockResolvedValue({
      kind: "error",
      status: 429,
      message: "rate limited",
      code: "RATE",
    });
    const { POST } = await import("./route");
    const res = await POST(new Request("http://local/x", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ id: "fu-3" }),
    });
    expect(res.status).toBe(429);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns table missing when select fails with undefined_table", async () => {
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({ data: null, error: { code: "42P01", message: "nope" } }),
              ),
            })),
          })),
        })),
      })),
    });
    const { POST } = await import("./route");
    const res = await POST(new Request("http://local/x", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ id: "fu-1" }),
    });
    expect(res.status).toBe(503);
    const json = (await res.json()) as { code?: string };
    expect(json.code).toBe("research_followup_table_missing");
  });
});
