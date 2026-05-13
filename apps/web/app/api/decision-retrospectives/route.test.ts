import { describe, expect, it, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  getServiceSupabase: vi.fn(),
}));

vi.mock("@/lib/server/persona-chat-auth", () => ({
  requirePersonaChatAuth: vi.fn(async () => ({ ok: true as const, userKey: "u-test" })),
}));

vi.mock("@/lib/server/supabase-service", () => ({
  getServiceSupabase: hoisted.getServiceSupabase,
}));

const sampleRow = {
  id: "r1",
  user_key: "u-test",
  source_type: "manual",
  source_id: null,
  symbol: null,
  title: "T",
  summary: "S",
  status: "draft",
  outcome: "unknown",
  quality_signals: [],
  detail_json: {},
  what_worked: null,
  what_did_not_work: null,
  next_rule: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("GET /api/decision-retrospectives", () => {
  beforeEach(() => {
    hoisted.getServiceSupabase.mockReset();
  });

  it("is read-only (select only) and returns qualityMeta", async () => {
    const statsPromise = Promise.resolve({
      data: [{ status: "draft", outcome: "unknown", quality_signals: [], created_at: "2026-06-01T00:00:00.000Z" }],
      error: null,
    });
    const listPromise = Promise.resolve({ data: [sampleRow], error: null });

    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn((cols: string) => {
          if (cols === "*") {
            return {
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => listPromise),
                })),
              })),
            };
          }
          return {
            eq: vi.fn(() => ({
              limit: vi.fn(() => statsPromise),
            })),
          };
        }),
      })),
    });

    const { GET } = await import("./route");
    const res = await GET(new Request("http://local/api/decision-retrospectives"));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok?: boolean; qualityMeta?: { decisionRetrospectives?: { totalCount: number } } };
    expect(j.ok).toBe(true);
    expect(j.qualityMeta?.decisionRetrospectives?.totalCount).toBe(1);
  });

  it("GET never calls insert", async () => {
    const insert = vi.fn();
    const statsPromise = Promise.resolve({
      data: [{ status: "draft", outcome: "unknown", quality_signals: [], created_at: "2026-06-01T00:00:00.000Z" }],
      error: null,
    });
    const listPromise = Promise.resolve({ data: [], error: null });
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn((cols: string) => {
          if (cols === "*") {
            return {
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => listPromise),
                })),
              })),
            };
          }
          return {
            eq: vi.fn(() => ({
              limit: vi.fn(() => statsPromise),
            })),
          };
        }),
        insert,
      })),
    });
    const { GET } = await import("./route");
    await GET(new Request("http://local/api/decision-retrospectives"));
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns decision_retrospective_table_missing on 42P01", async () => {
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn((cols: string) => {
          if (cols === "*") {
            return {
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() =>
                    Promise.resolve({ data: null, error: { code: "42P01", message: "relation missing" } }),
                  ),
                })),
              })),
            };
          }
          return {
            eq: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          };
        }),
      })),
    });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://local/api/decision-retrospectives"));
    expect(res.status).toBe(503);
    const j = (await res.json()) as { code?: string; actionHint?: string };
    expect(j.code).toBe("decision_retrospective_table_missing");
    expect(j.actionHint).toContain("append_decision_retrospectives.sql");
  });
});

describe("POST /api/decision-retrospectives", () => {
  beforeEach(() => {
    hoisted.getServiceSupabase.mockReset();
  });

  it("creates manual row", async () => {
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: sampleRow, error: null })),
          })),
        })),
      })),
    });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://local/x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "manual", title: "Hello", summary: "Sum" }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid outcome", async () => {
    hoisted.getServiceSupabase.mockReturnValue({ from: vi.fn() });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://local/x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "manual", title: "Hello", outcome: "nope" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/decision-retrospectives/[id]", () => {
  beforeEach(() => {
    hoisted.getServiceSupabase.mockReset();
  });

  it("returns 404 for other user row", async () => {
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
    const { PATCH } = await import("./[id]/route");
    const res = await PATCH(
      new Request("http://local/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: "helpful" }),
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("applies status reviewed", async () => {
    const row = {
      ...sampleRow,
      id: "rid-1",
      user_key: "u-test",
      status: "draft",
    };
    const updated = { ...row, status: "reviewed" };
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
                maybeSingle: vi.fn(() => Promise.resolve({ data: updated, error: null })),
              })),
            })),
          })),
        })),
      })),
    });
    const { PATCH } = await import("./[id]/route");
    const res = await PATCH(
      new Request("http://local/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "reviewed" }),
      }),
      { params: Promise.resolve({ id: "rid-1" }) },
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { item?: { status?: string } };
    expect(j.item?.status).toBe("reviewed");
  });

  it("returns 400 for invalid status with actionHint", async () => {
    const row = { ...sampleRow, id: "rid-2", user_key: "u-test", status: "draft" };
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
    const { PATCH } = await import("./[id]/route");
    const res = await PATCH(
      new Request("http://local/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "not_a_status" }),
      }),
      { params: Promise.resolve({ id: "rid-2" }) },
    );
    expect(res.status).toBe(400);
    const j = (await res.json()) as { actionHint?: string };
    expect(j.actionHint).toMatch(/draft|reviewed|learned|archived/i);
  });
});
