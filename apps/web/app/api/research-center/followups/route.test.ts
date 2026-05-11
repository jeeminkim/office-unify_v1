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

vi.mock("@/lib/server/researchFollowupOps", () => ({
  logResearchFollowupOpsEvent: vi.fn(async () => {}),
}));

function chainForList(final: Promise<{ data: unknown; error: unknown }>) {
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

function chainForStats(final: Promise<{ data: unknown; error: unknown }>) {
  return {
    eq: vi.fn(() => ({
      limit: vi.fn(() => final),
    })),
  };
}

describe("/api/research-center/followups GET", () => {
  beforeEach(() => {
    hoisted.getServiceSupabase.mockReset();
  });

  it("is read-only: no insert, update, or upsert on Supabase client", async () => {
    const insert = vi.fn();
    const update = vi.fn();
    const upsert = vi.fn();
    const rows = [
      {
        id: "1",
        status: "open",
        symbol: "005930",
        category: "valuation",
        priority: "medium",
        updated_at: new Date().toISOString(),
        selected_for_pb: false,
        pb_session_id: null,
        pb_turn_id: null,
      },
    ];
    const statsRows = [
      {
        status: "open",
        category: "valuation",
        priority: "medium",
        updated_at: new Date().toISOString(),
        selected_for_pb: false,
        pb_session_id: null,
        pb_turn_id: null,
      },
    ];
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        insert,
        update,
        upsert,
        select: vi.fn((cols: string) => {
          if (cols.includes("pb_turn_id")) {
            return chainForStats(Promise.resolve({ data: statsRows, error: null }));
          }
          return chainForList(Promise.resolve({ data: rows, error: null }));
        }),
      })),
    });
    const { GET } = await import("./route");
    const res = await GET(
      new Request(
        "http://local/api/research-center/followups?status=open&symbol=005930&category=valuation",
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; qualityMeta?: { followups?: { summary?: { totalCount: number } } } };
    expect(json.ok).toBe(true);
    expect(json.qualityMeta?.followups?.summary?.totalCount).toBe(1);
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns items filtered by status and symbol", async () => {
    const rows = [{ id: "1", status: "open", symbol: "005930", category: "other", priority: "medium", updated_at: new Date().toISOString(), selected_for_pb: false, pb_session_id: null, pb_turn_id: null }];
    const statsRows = [
      { status: "open", category: "other", priority: "medium", updated_at: new Date().toISOString(), selected_for_pb: false, pb_session_id: null, pb_turn_id: null },
    ];
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn((cols: string) => {
          if (cols.includes("pb_turn_id")) {
            return chainForStats(Promise.resolve({ data: statsRows, error: null }));
          }
          return chainForList(Promise.resolve({ data: rows, error: null }));
        }),
      })),
    });
    const { GET } = await import("./route");
    const res = await GET(
      new Request("http://local/api/research-center/followups?status=open&symbol=005930"),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; items: unknown[]; qualityMeta?: { followups?: { summary?: { totalCount: number } } } };
    expect(json.ok).toBe(true);
    expect(json.items).toEqual(rows);
    expect(json.qualityMeta?.followups?.summary?.totalCount).toBe(1);
  });

  it("returns actionHint when select fails for generic error", async () => {
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn((cols: string) => {
          if (cols.includes("pb_turn_id")) {
            return chainForStats(Promise.resolve({ data: [], error: null }));
          }
          return chainForList(Promise.resolve({ data: null, error: { message: "timeout" } }));
        }),
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
        select: vi.fn((cols: string) => {
          if (cols.includes("pb_turn_id")) {
            return chainForStats(
              Promise.resolve({
                data: null,
                error: { code: "42P01", message: 'relation "web_research_followup_items" does not exist' },
              }),
            );
          }
          return chainForList(
            Promise.resolve({
              data: null,
              error: { code: "42P01", message: 'relation "web_research_followup_items" does not exist' },
            }),
          );
        }),
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

  it("returns existing item when duplicate requestId+title+symbol", async () => {
    const existing = { id: "dup-1", title: "Same", user_key: "u-test", research_request_id: "req-1", symbol: "AAA" };
    const dupSelectChain = {
      eq: vi.fn(function dupEq(this: typeof dupSelectChain) {
        return this;
      }),
      is: vi.fn(function dupIs(this: typeof dupSelectChain) {
        return this;
      }),
      limit: vi.fn(() => Promise.resolve({ data: [{ id: "dup-1", title: "Same" }], error: null })),
    };
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn((cols: string) => {
          if (cols.includes("id")) {
            return dupSelectChain;
          }
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: existing, error: null })),
              })),
            })),
          };
        }),
      })),
    });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://local/api/research-center/followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Same",
          researchRequestId: "req-1",
          symbol: "AAA",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      duplicate?: boolean;
      item?: { id?: string };
      qualityMeta?: { followups?: { duplicate?: boolean; dedupePolicy?: string } };
    };
    expect(json.duplicate).toBe(true);
    expect(json.item?.id).toBe("dup-1");
    expect(json.qualityMeta?.followups?.duplicate).toBe(true);
    expect(json.qualityMeta?.followups?.dedupePolicy).toContain("user_key");
  });

  it("returns existing item when duplicate matches after title normalize", async () => {
    const existing = { id: "dup-1", title: "same", user_key: "u-test", research_request_id: "req-1", symbol: "AAA" };
    const dupSelectChain = {
      eq: vi.fn(function dupEq(this: typeof dupSelectChain) {
        return this;
      }),
      is: vi.fn(function dupIs(this: typeof dupSelectChain) {
        return this;
      }),
      limit: vi.fn(() => Promise.resolve({ data: [{ id: "dup-1", title: "same" }], error: null })),
    };
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn((cols: string) => {
          if (cols.includes("id")) {
            return dupSelectChain;
          }
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: existing, error: null })),
              })),
            })),
          };
        }),
      })),
    });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://local/api/research-center/followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "  SAME  ",
          researchRequestId: "req-1",
          symbol: "AAA",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { duplicate?: boolean; item?: { id?: string; title?: string } };
    expect(json.duplicate).toBe(true);
    expect(json.item?.title).toBe("same");
  });

  it("returns table missing contract on insert failure", async () => {
    const dupSelectChain = {
      eq: vi.fn(function (this: typeof dupSelectChain) {
        return this;
      }),
      is: vi.fn(function (this: typeof dupSelectChain) {
        return this;
      }),
      limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
    };
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn((cols: string) => {
          if (cols.includes("id")) return dupSelectChain;
          return {};
        }),
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
