import { describe, expect, it } from 'vitest';
import { buildPersonalizationPromptBlock } from './userPersonalizationPromptBlock';
import type { UserPersonalizationContext } from '@office-unify/shared-types';

/** Mirrors ai-office-engine append behavior for committee/persona/PB. */
function appendPersonalizationToSystemInstruction(
  systemInstruction: string,
  personalizationContextAppend?: string,
): string {
  let out = systemInstruction;
  if (personalizationContextAppend?.trim()) {
    out += `\n\n${personalizationContextAppend.trim()}`;
  }
  return out;
}

const sampleAppend = buildPersonalizationPromptBlock({
  generatedAt: new Date().toISOString(),
  profile: { status: 'partial', riskTone: 'moderate', summaryLines: ['손실 허용 성향 코드: medium'] },
  currentWorkload: {
    openActionItemCount: 1,
    staleActionItemCount: 0,
    riskReviewCount: 1,
    topOpenActions: [{ title: '열린 리스크 점검' }],
  },
  recentFeedback: { hide7dCount: 0, reviewedCount: 0, keepObservingCount: 0, summaryLines: [] },
  judgmentPatterns: {
    status: 'available',
    repeatedPatterns: ['US anchor 점검 누락'],
    missedChecks: [],
    nextRules: [],
  },
  dataQuality: { blockers: [], warnings: [] },
  promptBlock: { compactKo: '' },
  qualityMeta: { sources: ['investor_profile'], missingSources: [], readOnly: true },
} satisfies UserPersonalizationContext).compactKo;

describe('personalizationInjection', () => {
  it('appends committee/persona/PB personalization block to system instruction', () => {
    const base = 'You are a committee member.';
    const merged = appendPersonalizationToSystemInstruction(base, sampleAppend);
    expect(merged).toContain('[사용자 투자 운영 맥락]');
    expect(merged).toContain('US anchor 점검 누락');
    const userDerived = merged.split('[답변 원칙]')[0] ?? '';
    expect(userDerived).not.toMatch(/즉시\s*매수|즉시\s*매도|매수\s*추천/);
  });

  it('keeps base prompt when append is empty (profile missing path)', () => {
    const base = 'You are PB.';
    expect(appendPersonalizationToSystemInstruction(base, '')).toBe(base);
    expect(appendPersonalizationToSystemInstruction(base, undefined)).toBe(base);
  });

  it('streaming and non-streaming use the same append string shape', () => {
    const nonStream = appendPersonalizationToSystemInstruction('SYS', sampleAppend);
    const stream = appendPersonalizationToSystemInstruction('SYS', sampleAppend);
    expect(nonStream).toBe(stream);
  });
});
