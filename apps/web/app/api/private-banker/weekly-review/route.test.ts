import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  getServiceSupabase: vi.fn(),
  runPb: vi.fn(),
  buildCtx: vi.fn(),
  sanitize: vi.fn(() => ({ weekOf: "2026-05-11" })),
  buildPrompt: vi.fn(() => "weekly-prompt"),
  buildPreview: vi.fn(() => ({
    weekOf: "2026-05-11",
    profileStatus: "missing" as const,
    sections: { candidates: [], followups: [], risks: [], questions: [] },
    caveat: "매수 추천이 아니라 이번 주 확인할 질문입니다.",
    qualityMeta: {
      todayCandidateCount: 0,
      staleFollowupCount: 0,
      concentrationRiskCount: 0,
      suitabilityWarningCount: 0,
      dataQuality: "missing" as const,
    },
  })),
  prepareCtx: vi.fn(async () => ({ sessionId: "sess-wr-1" })),
}));

vi.mock("@/lib/server/persona-chat-auth", () => ({
  requirePersonaChatAuth: vi.fn(async () => ({ ok: true as const, userKey: "u-test" })),
}));

vi.mock("@/lib/server/supabase-service", () => ({
  getServiceSupabase: hoisted.getServiceSupabase,
}));

vi.mock("@/lib/server/runPrivateBankerMessage", () => ({
  buildPrivateBankerContentHash: vi.fn(() => "hash-wr"),
  runPrivateBankerMessageWithDbIdempotency: hoisted.runPb,
}));

vi.mock("@/lib/server/privateBankerWeeklyReview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/privateBankerWeeklyReview")>();
  return {
    ...actual,
    buildPrivateBankerWeeklyReviewContext: hoisted.buildCtx,
    buildPrivateBankerWeeklyReviewPrompt: hoisted.buildPrompt,
    buildPbWeeklyReviewFromContext: hoisted.buildPreview,
    sanitizeWeeklyReviewContext: hoisted.sanitize,
    weekOfMondayKstIso: vi.fn(() => "2026-05-11"),
  };
});

vi.mock("@office-unify/ai-office-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@office-unify/ai-office-engine")>();
  return {
    ...actual,
    preparePrivateBankerTurnContext: hoisted.prepareCtx,
  };
});

vi.mock("@/lib/server/investorProfile", () => ({
  getInvestorProfileForUser: vi.fn(async () => ({ ok: true as const, profile: null, profileStatus: "missing" as const })),
}));

vi.mock("@/lib/server/concentrationRisk", () => ({
  buildConcentrationRiskPromptSection: vi.fn(() => "(conc)"),
  getPortfolioExposureSnapshotForUser: vi.fn(async () => ({})),
}));

vi.mock("@/lib/server/suitabilityAssessment", () => ({
  buildInvestorProfilePromptContext: vi.fn(() => "(profile)"),
}));

vi.mock("@/lib/server/investmentAssistantOutputFormat", () => ({
  normalizeInvestmentAssistantOutput: vi.fn((s: string) => ({
    text: s,
    quality: { formatValid: true, missingSections: [], normalized: false, warnings: [] },
  })),
}));

describe("/api/private-banker/weekly-review", () => {
  beforeEach(() => {
    hoisted.getServiceSupabase.mockReset();
    hoisted.runPb.mockReset();
    hoisted.buildCtx.mockReset();
    hoisted.prepareCtx.mockReset();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    hoisted.buildCtx.mockResolvedValue({
      weekOf: "2026-05-11",
      userKey: "u-test",
      profileStatus: "missing",
      investorProfileTableMissing: false,
      primaryCandidateDeck: [],
      followupRows: [],
      followupTableMissing: false,
      nowIso: new Date().toISOString(),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it(
    "GET returns 503 when supabase is not configured",
    async () => {
      hoisted.getServiceSupabase.mockReturnValue(null);
      const { GET } = await import("./route");
      const res = await GET();
      expect(res.status).toBe(503);
    },
    60_000,
  );

  it(
    "GET returns preview and recommendedIdempotencyKey without invoking PB idempotency",
    async () => {
    hoisted.getServiceSupabase.mockReturnValue({});
    const { GET } = await import("./route");
    const { buildRecommendedWeeklyReviewIdempotencyKey } = await import("@/lib/server/privateBankerWeeklyReview");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(hoisted.runPb).not.toHaveBeenCalled();
    const j = (await res.json()) as {
      ok?: boolean;
      preview?: { weekOf?: string };
      recommendedIdempotencyKey?: string;
      sqlReadiness?: {
        investorProfileTableMissing?: boolean;
        researchFollowupTableMissing?: boolean;
        actionHints?: string[];
      };
    };
    expect(j.ok).toBe(true);
    expect(j.preview?.weekOf).toBe("2026-05-11");
    expect(j.sqlReadiness?.investorProfileTableMissing).toBe(false);
    expect(j.sqlReadiness?.researchFollowupTableMissing).toBe(false);
    expect(Array.isArray(j.sqlReadiness?.actionHints)).toBe(true);
    expect(j.sqlReadiness?.actionHints?.length ?? 0).toBe(0);
    expect(j.recommendedIdempotencyKey).toMatch(/^pb-weekly:2026-05-11:[a-f0-9]{24}$/);
    expect(j.recommendedIdempotencyKey).toBe(
      buildRecommendedWeeklyReviewIdempotencyKey("2026-05-11", { weekOf: "2026-05-11" } as Record<string, unknown>),
    );
    },
    60_000,
  );

  it(
    "GET sqlReadiness lists hints when investor profile / follow-up tables are missing",
    async () => {
    hoisted.getServiceSupabase.mockReturnValue({});
    hoisted.buildCtx.mockResolvedValueOnce({
      weekOf: "2026-05-11",
      userKey: "u-test",
      profileStatus: "missing",
      investorProfileTableMissing: true,
      primaryCandidateDeck: [],
      followupRows: [],
      followupTableMissing: true,
      nowIso: new Date().toISOString(),
    });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      sqlReadiness?: { actionHints?: string[] };
    };
    expect((j.sqlReadiness?.actionHints ?? []).length).toBeGreaterThanOrEqual(2);
    },
    60_000,
  );

  it("POST requires idempotencyKey", async () => {
    hoisted.getServiceSupabase.mockReturnValue({});
    const { POST } = await import("./route");
    const res = await POST(new Request("http://local/x", { method: "POST", body: JSON.stringify({}) }));
    expect(res.status).toBe(400);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toContain("recommendedIdempotencyKey");
  });

  it("POST merges qualityMeta with response guard and calls idempotency runner", async () => {
    hoisted.getServiceSupabase.mockReturnValue({});
    hoisted.runPb.mockResolvedValue({
      kind: "ok",
      deduplicated: false,
      body: {
        userMessage: { id: "um-1", role: "user", content: "x", createdAt: new Date().toISOString() },
        assistantMessage: {
          id: "am-1",
          role: "assistant",
          content: "[행동 분류]\n[정보 상태]\n[사용자 적합성 점검]\n[보유 집중도 점검]\n[지금 해야 할 행동]\n[하면 안 되는 행동]\n자동 주문을 하지 않습니다.\n[관찰해야 할 신호]\n",
          createdAt: new Date().toISOString(),
        },
        longTermMemorySummary: null,
      },
    });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://local/x", {
        method: "POST",
        body: JSON.stringify({ idempotencyKey: "weekly-review:test-key" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(hoisted.runPb).toHaveBeenCalledTimes(1);
    const j = (await res.json()) as {
      pbSessionId?: string;
      pbTurnId?: string;
      report?: { qualityMeta?: { todayCandidateCount?: number; privateBanker?: { responseGuard?: { missingSections?: string[]; policyPhraseWarnings?: string[] } } } };
    };
    expect(j.pbSessionId).toBe("sess-wr-1");
    expect(j.pbTurnId).toBe("am-1");
    expect(j.report?.qualityMeta?.todayCandidateCount).toBe(0);
    expect(j.report?.qualityMeta?.privateBanker?.responseGuard?.missingSections).toEqual([]);
    expect(j.report?.qualityMeta?.privateBanker?.responseGuard?.policyPhraseWarnings ?? []).toEqual([]);
  });
});
