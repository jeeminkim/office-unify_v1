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

function chainForSelect(final: Promise<{ data: unknown; error: unknown }>) {
  const c = {
    eq: vi.fn(function eqFn(this: typeof c) {
      return this;
    }),
    order: vi.fn(() => ({
      limit: vi.fn(() => final),
    })),
  };
  return c;
}

describe("/api/research-center/followups GET", () => {
  beforeEach(() => {
    hoisted.getServiceSupabase.mockReset();
  });

  it("returns items filtered by status and symbol", async () => {
    const rows = [{ id: "1", status: "open", symbol: "005930" }];
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => chainForSelect(Promise.resolve({ data: rows, error: null }))),
      })),
    });
    const { GET } = await import("./route");
    const res = await GET(
      new Request("http://local/api/research-center/followups?status=open&symbol=005930"),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; items: unknown[] };
    expect(json.ok).toBe(true);
    expect(json.items).toEqual(rows);
  });

  it("returns actionHint when select fails for generic error", async () => {
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => chainForSelect(Promise.resolve({ data: null, error: { message: "timeout" } }))),
      })),
    });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://local/api/research-center/followups"));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { actionHint?: string };
    expect(json.actionHint).toContain("다시");
  });

  it("returns research_followup_table_missing when relation missing", async () => {
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() =>
          chainForSelect(
            Promise.resolve({
              data: null,
              error: { code: "42P01", message: 'relation "web_research_followup_items" does not exist' },
            }),
          ),
        ),
      })),
    });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://local/api/research-center/followups"));
    expect(res.status).toBe(503);
    const json = (await res.json()) as { code?: string; actionHint?: string };
    expect(json.code).toBe("research_followup_table_missing");
    expect(json.actionHint).toContain("append_research_followup_items.sql");
  });
});

describe("/api/research-center/followups POST", () => {
  beforeEach(() => {
    hoisted.getServiceSupabase.mockReset();
  });

  it("returns table missing contract on insert failure", async () => {
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(() =>
              Promise.resolve({
                data: null,
                error: { code: "42P01", message: "relation missing" },
              }),
            ),
          })),
        })),
      })),
    });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://local/api/research-center/followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "t" }),
      }),
    );
    expect(res.status).toBe(503);
    const json = (await res.json()) as { code?: string };
    expect(json.code).toBe("research_followup_table_missing");
  });
});
