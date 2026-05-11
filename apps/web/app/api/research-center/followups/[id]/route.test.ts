import { describe, expect, it, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  getServiceSupabase: vi.fn(),
  logOps: vi.fn(async () => {}),
}));

vi.mock("@/lib/server/persona-chat-auth", () => ({
  requirePersonaChatAuth: vi.fn(async () => ({ ok: true as const, userKey: "u-test" })),
}));

vi.mock("@/lib/server/supabase-service", () => ({
  getServiceSupabase: hoisted.getServiceSupabase,
}));

vi.mock("@/lib/server/researchFollowupOps", () => ({
  logResearchFollowupOpsEvent: hoisted.logOps,
}));

describe("PATCH /api/research-center/followups/[id]", () => {
  beforeEach(() => {
    hoisted.getServiceSupabase.mockReset();
    hoisted.logOps.mockReset();
  });

  it("updates status and logs ops when status changes", async () => {
    const row = {
      id: "id-1",
      user_key: "u-test",
      status: "open",
      detail_json: {},
      priority: "medium",
    };
    const updateChain = {
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(() =>
              Promise.resolve({
                data: { ...row, status: "tracking" },
                error: null,
              }),
            ),
          })),
        })),
      })),
    };
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
            })),
          })),
        })),
        update: vi.fn(() => updateChain),
      })),
    });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://local/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "tracking" }),
      }),
      { params: Promise.resolve({ id: "id-1" }) },
    );
    expect(res.status).toBe(200);
    expect(hoisted.logOps).toHaveBeenCalled();
  });

  it("returns 400 for invalid status", async () => {
    const row = { id: "id-1", user_key: "u-test", status: "open", detail_json: {}, priority: "medium" };
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
            })),
          })),
        })),
      })),
    });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://local/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "nope" }),
      }),
      { params: Promise.resolve({ id: "id-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when row missing", async () => {
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        })),
      })),
    });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://local/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns table missing on update 42P01", async () => {
    const row = { id: "id-1", user_key: "u-test", status: "open", detail_json: {}, priority: "medium" };
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({ data: null, error: { code: "42P01", message: "relation missing" } }),
                ),
              })),
            })),
          })),
        })),
      })),
    });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://local/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      }),
      { params: Promise.resolve({ id: "id-1" }) },
    );
    expect(res.status).toBe(503);
    const j = (await res.json()) as { code?: string; actionHint?: string };
    expect(j.code).toBe("research_followup_table_missing");
    expect(j.actionHint).toContain("append_research_followup_items");
  });
});
