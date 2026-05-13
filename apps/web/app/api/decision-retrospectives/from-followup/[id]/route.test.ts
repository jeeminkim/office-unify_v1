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

const fuRow = {
  id: "fu-1",
  user_key: "u-test",
  research_request_id: null,
  research_report_id: null,
  symbol: "005930",
  company_name: null,
  title: "T",
  detail_json: {},
  category: "other",
  priority: "medium",
  status: "open",
  selected_for_pb: false,
  pb_session_id: null,
  pb_turn_id: null,
  source: "research_center",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const retroRow = {
  id: "retro-1",
  user_key: "u-test",
  source_type: "research_followup",
  source_id: "fu-1",
  symbol: "005930",
  title: "Follow-up 복기: X",
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

function mockSupabaseForFollowup(opts: { followup: typeof fuRow | null; existingRetro: typeof retroRow | null }) {
  return {
    from: vi.fn((table: string) => {
      if (table === "web_research_followup_items") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: opts.followup, error: null })),
              })),
            })),
          })),
        };
      }
      if (table === "web_decision_retrospectives") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      maybeSingle: vi.fn(() => Promise.resolve({ data: opts.existingRetro, error: null })),
                    })),
                  })),
                })),
              })),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: retroRow, error: null })),
            })),
          })),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe("POST /api/decision-retrospectives/from-followup/[id]", () => {
  beforeEach(() => {
    hoisted.getServiceSupabase.mockReset();
  });

  it("returns 404 when follow-up missing", async () => {
    hoisted.getServiceSupabase.mockReturnValue(mockSupabaseForFollowup({ followup: null, existingRetro: null }));
    const { POST } = await import("./route");
    const res = await POST(new Request("http://local/x", { method: "POST" }), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns existing retro when deduped", async () => {
    hoisted.getServiceSupabase.mockReturnValue(mockSupabaseForFollowup({ followup: fuRow, existingRetro: retroRow }));
    const { POST } = await import("./route");
    const res = await POST(new Request("http://local/x", { method: "POST" }), { params: Promise.resolve({ id: "fu-1" }) });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { deduped?: boolean };
    expect(j.deduped).toBe(true);
  });
});
