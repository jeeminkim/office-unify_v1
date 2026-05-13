import { describe, expect, it } from "vitest";
import {
  parseTodayCandidateForDecisionRetro,
  TODAY_RETRO_CANDIDATE_MAX_FACTOR_MESSAGE_LEN,
  TODAY_RETRO_CANDIDATE_MAX_FACTORS,
} from "@/lib/server/decisionRetrospectiveTodayCandidatePayload";
import { buildDecisionRetroSeedFromTodayCandidate } from "@/lib/server/decisionRetrospective";

function minimalCandidate(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: "c-1",
    name: "Co",
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
    ...overrides,
  };
}

describe("parseTodayCandidateForDecisionRetro", () => {
  it("ignores non-whitelisted top-level keys on candidate", () => {
    const raw = {
      candidate: {
        ...minimalCandidate(),
        evilPayload: { nested: "x".repeat(5000) },
      },
    };
    const out = parseTodayCandidateForDecisionRetro(raw);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect("evilPayload" in out.candidate).toBe(false);
    }
  });

  it("rejects factor message over max length", () => {
    const msg = "m".repeat(TODAY_RETRO_CANDIDATE_MAX_FACTOR_MESSAGE_LEN + 1);
    const out = parseTodayCandidateForDecisionRetro({
      candidate: {
        ...minimalCandidate(),
        displayMetrics: {
          observationScore: 1,
          scoreLabel: "보통",
          confidenceLabel: "보통",
          dataQualityLabel: "d",
          relationLabel: "r",
          scoreExplanation: "e",
          scoreExplanationDetail: {
            finalScore: 1,
            factors: [{ code: "unknown", label: "L", direction: "neutral", message: msg }],
            summary: "s",
            caveat: "c",
          },
        },
      },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toMatch(/factor.message/);
      expect(out.actionHint.length).toBeGreaterThan(10);
    }
  });

  it("rejects too many factors", () => {
    const factors = Array.from({ length: TODAY_RETRO_CANDIDATE_MAX_FACTORS + 1 }, (_, i) => ({
      code: "unknown",
      label: "L",
      direction: "neutral" as const,
      message: String(i),
    }));
    const out = parseTodayCandidateForDecisionRetro({
      candidate: {
        ...minimalCandidate(),
        displayMetrics: {
          observationScore: 1,
          scoreLabel: "보통",
          confidenceLabel: "보통",
          dataQualityLabel: "d",
          relationLabel: "r",
          scoreExplanation: "e",
          scoreExplanationDetail: { finalScore: 1, factors, summary: "s", caveat: "c" },
        },
      },
    });
    expect(out.ok).toBe(false);
  });

  it("detail seed does not embed full candidate object", () => {
    const raw = { candidate: minimalCandidate({ name: "OnlyName" }) };
    const out = parseTodayCandidateForDecisionRetro(raw);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const seed = buildDecisionRetroSeedFromTodayCandidate(out.candidate);
    const dj = JSON.stringify(seed.detailJson);
    expect(dj).not.toContain("reasonDetails");
    expect(dj).toContain("candidateId");
    expect(dj.length).toBeLessThan(4000);
  });
});
