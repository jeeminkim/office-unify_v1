import { describe, expect, it, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  fromMock: vi.fn(),
  logOpsEvent: vi.fn(),
}));

vi.mock("@/lib/server/persona-chat-auth", () => ({
  requirePersonaChatAuth: vi.fn(async () => ({ ok: true as const, userKey: "u-test" })),
}));

vi.mock("@/lib/server/supabase-service", () => ({
  getServiceSupabase: vi.fn(() => ({
    from: hoisted.fromMock,
  })),
}));

vi.mock("@/lib/server/opsEventLogger", () => ({
  logOpsEvent: hoisted.logOpsEvent,
}));

async function post(body: Record<string, unknown>) {
  const { POST } = await import("./route");
  return POST(
    new Request("http://local/api/portfolio/watchlist/sector-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/portfolio/watchlist/sector-match", () => {
  beforeEach(() => {
    hoisted.fromMock.mockReset();
    hoisted.logOpsEvent.mockReset();
    hoisted.logOpsEvent.mockImplementation(() => Promise.resolve());
  });

  it("preview: select-only, no logOpsEvent, no update, legacy fields + previewReadOnly", async () => {
    hoisted.fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
      update: () => {
        throw new Error("update should not be called in preview");
      },
    }));
    const res = await post({ mode: "preview" });
    expect(res.ok).toBe(true);
    expect(hoisted.logOpsEvent).not.toHaveBeenCalled();
    const j = (await res.json()) as {
      ok: boolean;
      mode: string;
      items: unknown[];
      warnings: unknown[];
      qualityMeta?: unknown;
      previewReadOnly?: boolean;
    };
    expect(j.ok).toBe(true);
    expect(j.mode).toBe("preview");
    expect(Array.isArray(j.items)).toBe(true);
    expect(Array.isArray(j.warnings)).toBe(true);
    expect(j.qualityMeta).toBeDefined();
    expect(j.previewReadOnly).toBe(true);
  });

  it("preview failure: no ops write, actionHint present", async () => {
    hoisted.fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => Promise.resolve({ data: null, error: { message: "relation does not exist" } }),
      }),
    }));
    const res = await post({ mode: "preview" });
    expect(hoisted.logOpsEvent).not.toHaveBeenCalled();
    const j = (await res.json()) as { ok: boolean; actionHint?: string; previewReadOnly?: boolean };
    expect(j.ok).toBe(false);
    expect(j.actionHint).toBeTruthy();
    expect(j.previewReadOnly).toBe(true);
  });

  it("apply: empty batch still records batch success via logOpsEvent", async () => {
    hoisted.fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    }));
    const res = await post({ mode: "apply" });
    expect(res.ok).toBe(true);
    expect(hoisted.logOpsEvent.mock.calls.length).toBeGreaterThanOrEqual(1);
    const j = (await res.json()) as { previewReadOnly?: boolean; mode: string };
    expect(j.mode).toBe("apply");
    expect(j.previewReadOnly).toBeUndefined();
  });
});
