import { describe, expect, it } from "vitest";
import {
  DECISION_RETRO_COACH_CAVEAT,
  parseDecisionRetroCoachSuggestions,
  sanitizeDecisionRetroCoachSuggestion,
  stripMoneyLikePatterns,
} from "./decisionRetrospectiveCoach";

describe("decisionRetrospectiveCoach", () => {
  it("stripMoneyLikePatterns removes won and dollar amounts", () => {
    expect(stripMoneyLikePatterns("평가 1,234,567원 및 $500")).toBe("평가 [금액생략] 및 [금액생략]");
  });

  it("sanitizeDecisionRetroCoachSuggestion strips money tokens and filters unknown quality signals", () => {
    const s = sanitizeDecisionRetroCoachSuggestion({
      sourceType: "manual",
      title: "제목",
      summary: "요약 99,000원",
      suggestedOutcome: "helpful",
      suggestedQualitySignals: ["risk_warning_useful", "invalid_signal"],
      suggestedWhatWorked: "ok",
      caveat: DECISION_RETRO_COACH_CAVEAT,
    });
    expect(s?.summary).toContain("[금액생략]");
    expect(s?.suggestedQualitySignals).toEqual(["risk_warning_useful"]);
  });

  it("parseDecisionRetroCoachSuggestions returns failed when no json fence", () => {
    const r = parseDecisionRetroCoachSuggestions("no json here");
    expect(r.parseStatus).toBe("failed");
    expect(r.suggestions).toEqual([]);
  });

  it("parseDecisionRetroCoachSuggestions parses fenced json", () => {
    const raw = `\`\`\`json\n{"suggestions":[{"sourceType":"research_followup","sourceId":"f1","title":"Follow","summary":"체크","suggestedOutcome":"unknown","suggestedQualitySignals":["followup_checked"],"caveat":"${DECISION_RETRO_COACH_CAVEAT}"}]}\n\`\`\``;
    const r = parseDecisionRetroCoachSuggestions(raw);
    expect(r.parseStatus).toBe("ok");
    expect(r.suggestions[0]?.sourceType).toBe("research_followup");
    expect(r.suggestions[0]?.sourceId).toBe("f1");
  });
});
