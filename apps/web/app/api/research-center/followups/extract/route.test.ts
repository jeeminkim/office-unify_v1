import { describe, expect, it, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  getServiceSupabase: vi.fn(),
  insertMock: vi.fn(),
}));

vi.mock("@/lib/server/persona-chat-auth", () => ({
  requirePersonaChatAuth: vi.fn(async () => ({ ok: true as const, userKey: "u-test" })),
}));

vi.mock("@/lib/server/supabase-service", () => ({
  getServiceSupabase: hoisted.getServiceSupabase,
}));

const sampleMd = `## 다음에 확인할 것
- 삼성전자 파운드리 가동률 확인`;

describe("POST /api/research-center/followups/extract", () => {
  beforeEach(() => {
    hoisted.getServiceSupabase.mockReset();
    hoisted.insertMock.mockReset();
    hoisted.insertMock.mockReturnValue(Promise.resolve({ error: null }));
    const dupSelectChain = {
      eq: vi.fn(function dupEq(this: typeof dupSelectChain) {
        return this;
      }),
      is: vi.fn(function dupIs(this: typeof dupSelectChain) {
        return this;
      }),
      limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
    };
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn((cols: string) => {
          if (cols.includes("id")) return dupSelectChain;
          return dupSelectChain;
        }),
        insert: hoisted.insertMock,
      })),
    });
  });

  it("does not call insert when save is false", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://local/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: sampleMd, save: false }),
      }),
    );
    expect(res.ok).toBe(true);
    expect(hoisted.insertMock).not.toHaveBeenCalled();
    const json = (await res.json()) as { saved: boolean };
    expect(json.saved).toBe(false);
  });

  it("calls insert per item when save is true", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://local/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown: sampleMd,
          save: true,
          symbol: "005930",
          companyName: "삼성전자",
          researchRequestId: "req-1",
          researchReportId: "rep-9",
          requestId: "trace-xyz",
        }),
      }),
    );
    expect(res.ok).toBe(true);
    expect(hoisted.insertMock).toHaveBeenCalled();
    const call = hoisted.insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.user_key).toBe("u-test");
    expect(call.research_request_id).toBe("req-1");
    expect(call.research_report_id).toBe("rep-9");
    expect(call.symbol).toBe("005930");
    expect(call.company_name).toBe("삼성전자");
    expect((call.detail_json as Record<string, unknown>).requestId).toBe("trace-xyz");
    expect((call.detail_json as Record<string, unknown>).researchReportId).toBe("rep-9");
  });

  it("returns empty list and extractEmptyHint when section has no bullets", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://local/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: "## 다음에 확인할 것\n", save: false }),
      }),
    );
    expect(res.ok).toBe(true);
    const json = (await res.json()) as { followupItems: unknown[]; extractEmptyHint?: string };
    expect(json.followupItems).toEqual([]);
    expect(json.extractEmptyHint).toBeDefined();
  });
});
