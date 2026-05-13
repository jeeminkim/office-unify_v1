import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  getServiceSupabase: vi.fn(),
  runPb: vi.fn(),
  buildCtx: vi.fn(),
  buildPrompt: vi.fn(() => "coach-prompt"),
  parseSuggestions: vi.fn(() => ({
    suggestions: [
      {
        sourceType: "manual",
        title: "테스트 복기",
        summary: "요약",
        suggestedOutcome: "unknown",
        suggestedQualitySignals: [],
        caveat: "PB가 제안한 초안입니다.",
      },
    ],
    parseStatus: "ok" as const,
  })),
  prepareCtx: vi.fn(async () => ({ sessionId: "sess-coach-1" })),
  insertSpy: vi.fn(),
}));

vi.mock("@/lib/server/persona-chat-auth", () => ({
  requirePersonaChatAuth: vi.fn(async () => ({ ok: true as const, userKey: "u-test" })),
}));

vi.mock("@/lib/server/supabase-service", () => ({
  getServiceSupabase: hoisted.getServiceSupabase,
}));

vi.mock("@/lib/server/runPrivateBankerMessage", () => ({
  buildPrivateBankerContentHash: vi.fn(() => "hash-coach"),
  runPrivateBankerMessageWithDbIdempotency: hoisted.runPb,
}));

vi.mock("@/lib/server/decisionRetrospectiveCoach", () => ({
  buildDecisionRetroCoachContext: hoisted.buildCtx,
  buildDecisionRetroCoachPreviewEmpty: vi.fn((ctx: { todayDeck?: unknown[] }) => ({
    suggestions: [],
    qualityMeta: {
      sourceCount: Math.max(1, (ctx.todayDeck?.length ?? 0) + 1),
      suggestionCount: 0,
      sanitized: true as const,
      autoSaved: false as const,
    },
  })),
  buildDecisionRetroCoachPrompt: hoisted.buildPrompt,
  buildRecommendedRetroCoachIdempotencyKey: vi.fn(() => "retro-coach:mockkey"),
  countCoachContextSources: vi.fn(() => 4),
  parseDecisionRetroCoachSuggestions: hoisted.parseSuggestions,
}));

vi.mock("@office-unify/ai-office-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@office-unify/ai-office-engine")>();
  return {
    ...actual,
    preparePrivateBankerTurnContext: hoisted.prepareCtx,
  };
});

vi.mock("@/lib/server/investmentAssistantOutputFormat", () => ({
  normalizeInvestmentAssistantOutput: vi.fn((s: string) => ({
    text: s,
    quality: { formatValid: true, missingSections: [], normalized: false, warnings: [] },
  })),
}));

vi.mock("@/lib/server/privateBankerResponseGuard", () => ({
  auditRetroCoachPolicyWarnings: vi.fn(() => ({ policyPhraseWarnings: ["imperative_buy_instruction"] })),
}));

describe("/api/decision-retrospectives/coach", () => {
  beforeEach(() => {
    hoisted.getServiceSupabase.mockReset();
    hoisted.runPb.mockReset();
    hoisted.buildCtx.mockReset();
    hoisted.parseSuggestions.mockReset();
    hoisted.prepareCtx.mockReset();
    hoisted.insertSpy.mockReset();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    hoisted.buildCtx.mockResolvedValue({
      generatedAt: new Date().toISOString(),
      weekOf: "2026-05-11",
      profileStatus: "missing",
      todayDeck: [{ candidateId: "1" }],
      followups: [],
      draftRetrospectives: [],
      weeklyReviewOutline: { candidateItems: 1, followupItems: 0, riskItems: 0, questionItems: 0 },
    });
    hoisted.getServiceSupabase.mockReturnValue({
      from: () => ({
        insert: (...args: unknown[]) => {
          hoisted.insertSpy(...args);
          return { error: new Error("should not insert from coach") };
        },
      }),
    });
    hoisted.runPb.mockResolvedValue({
      kind: "ok" as const,
      deduplicated: false,
      body: {
        assistantMessage: {
          id: "turn-coach-1",
          content:
            '```json\n{"suggestions":[{"sourceType":"manual","title":"테스트 복기","summary":"요약","suggestedOutcome":"unknown","suggestedQualitySignals":[],"caveat":"PB가 제안한 초안입니다."}]}\n```',
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("GET returns read-only preview without calling insert", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      ok?: boolean;
      coachPreview?: { suggestions: unknown[] };
      recommendedCoachIdempotencyKey?: string;
    };
    expect(j.ok).toBe(true);
    expect(j.coachPreview?.suggestions).toEqual([]);
    expect(j.recommendedCoachIdempotencyKey).toMatch(/^retro-coach:/);
    expect(hoisted.insertSpy).not.toHaveBeenCalled();
  });

  it("POST runs PB and returns suggestions with autoSaved false and responseGuard", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/decision-retrospectives/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey: "retro-coach:test-1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      ok?: boolean;
      suggestions?: unknown[];
      qualityMeta?: { autoSaved?: boolean; parseStatus?: string; responseGuard?: { policyPhraseWarnings?: string[] } };
    };
    expect(j.ok).toBe(true);
    expect(j.suggestions?.length).toBeGreaterThanOrEqual(1);
    expect(j.qualityMeta?.autoSaved).toBe(false);
    expect(j.qualityMeta?.parseStatus).toBe("ok");
    expect(j.qualityMeta?.responseGuard?.policyPhraseWarnings).toContain("imperative_buy_instruction");
    expect(hoisted.insertSpy).not.toHaveBeenCalled();
  });
});
