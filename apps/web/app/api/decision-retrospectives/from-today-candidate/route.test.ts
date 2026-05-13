import { describe, expect, it, vi, beforeEach } from "vitest";
import { TODAY_RETRO_CANDIDATE_MAX_BODY_CHARS } from "@/lib/server/decisionRetrospectiveTodayCandidatePayload";

const hoisted = vi.hoisted(() => ({
  getServiceSupabase: vi.fn(),
}));

vi.mock("@/lib/server/persona-chat-auth", () => ({
  requirePersonaChatAuth: vi.fn(async () => ({ ok: true as const, userKey: "u-test" })),
}));

vi.mock("@/lib/server/supabase-service", () => ({
  getServiceSupabase: hoisted.getServiceSupabase,
}));

function minimalCandidate() {
  return {
    candidateId: "tc-99",
    name: "N",
    market: "KOSPI",
    country: "KR",
    source: "user_context",
    score: 1,
    confidence: "medium",
    riskLevel: "medium",
    reasonSummary: "rs",
    reasonDetails: [],
    positiveSignals: [],
    cautionNotes: [],
    relatedUserContext: [],
    relatedWatchlistSymbols: [],
    isBuyRecommendation: false,
  };
}

describe("POST /api/decision-retrospectives/from-today-candidate", () => {
  beforeEach(() => {
    hoisted.getServiceSupabase.mockReset();
  });

  it("returns 400 when body exceeds max size", async () => {
    hoisted.getServiceSupabase.mockReturnValue({ from: vi.fn() });
    const { POST } = await import("./route");
    const big = "x".repeat(TODAY_RETRO_CANDIDATE_MAX_BODY_CHARS + 1);
    const res = await POST(
      new Request("http://local/x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: big,
      }),
    );
    expect(res.status).toBe(400);
    const j = (await res.json()) as { actionHint?: string; error?: string };
    expect(j.actionHint).toBeDefined();
    expect(j.error).toMatch(/too large/i);
  });

  it("returns 200 and inserts when valid", async () => {
    const inserted = {
      id: "new-1",
      user_key: "u-test",
      source_type: "today_candidate",
      source_id: "tc-99",
      symbol: null,
      title: "T",
      summary: "S",
      status: "draft",
      outcome: "unknown",
      quality_signals: [],
      detail_json: { seed: "today_candidate" },
      what_worked: null,
      what_did_not_work: null,
      next_rule: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    let fromCalls = 0;
    hoisted.getServiceSupabase.mockReturnValue({
      from: vi.fn(() => {
        fromCalls += 1;
        if (fromCalls === 1) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                      })),
                    })),
                  })),
                })),
              })),
            })),
          };
        }
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: inserted, error: null })),
            })),
          })),
        };
      }),
    });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://local/x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate: minimalCandidate() }),
      }),
    );
    expect(res.status).toBe(200);
  });
});
