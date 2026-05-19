import { describe, expect, it } from 'vitest';
import type { UserPersonalizationContext } from '@office-unify/shared-types';
import {
  PERSONALIZATION_PROMPT_MAX_CHARS,
  buildPersonalizationContextSummary,
  buildPersonalizationPromptBlock,
  sanitizePersonalizationLine,
} from './userPersonalizationPromptBlock';

function baseContext(overrides?: Partial<UserPersonalizationContext>): UserPersonalizationContext {
  return {
    generatedAt: new Date().toISOString(),
    profile: {
      status: 'missing',
      riskTone: 'unknown',
      summaryLines: [],
    },
    currentWorkload: {
      openActionItemCount: 0,
      staleActionItemCount: 0,
      riskReviewCount: 0,
      topOpenActions: [],
    },
    recentFeedback: {
      hide7dCount: 0,
      reviewedCount: 0,
      keepObservingCount: 0,
      summaryLines: [],
    },
    judgmentPatterns: {
      status: 'missing',
      repeatedPatterns: [],
      missedChecks: [],
      nextRules: [],
    },
    dataQuality: { blockers: [], warnings: [] },
    promptBlock: { compactKo: '' },
    qualityMeta: { sources: [], missingSources: ['investor_profile'], readOnly: true },
    ...overrides,
  };
}

describe('userPersonalizationPromptBlock', () => {
  it('shows safe profile-missing label in block', () => {
    const block = buildPersonalizationPromptBlock(baseContext());
    expect(block.compactKo).toContain('[사용자 투자 운영 맥락]');
    expect(block.compactKo).toContain('missing');
    const userDerived = block.compactKo.split('[답변 원칙]')[0] ?? '';
    expect(userDerived).not.toMatch(/매수\s*추천|즉시\s*매수|즉시\s*매도/);
  });

  it('includes repeated patterns when available', () => {
    const block = buildPersonalizationPromptBlock(
      baseContext({
        judgmentPatterns: {
          status: 'available',
          repeatedPatterns: ['US 데이터 점검 지연'],
          missedChecks: [],
          nextRules: [],
        },
      }),
    );
    expect(block.compactKo).toContain('반복 패턴');
    expect(block.compactKo).toContain('US 데이터 점검 지연');
  });

  it('caps prompt block length', () => {
    const longPatterns = Array.from({ length: 40 }, (_, i) => `패턴-${i}-`.repeat(20));
    const block = buildPersonalizationPromptBlock(
      baseContext({
        judgmentPatterns: {
          status: 'available',
          repeatedPatterns: longPatterns,
          missedChecks: longPatterns,
          nextRules: longPatterns,
        },
        currentWorkload: {
          openActionItemCount: 12,
          staleActionItemCount: 5,
          riskReviewCount: 3,
          topOpenActions: longPatterns.map((p, i) => ({
            title: p,
            ageDays: i,
          })),
        },
      }),
    );
    expect(block.compactKo.length).toBeLessThanOrEqual(PERSONALIZATION_PROMPT_MAX_CHARS);
  });

  it('sanitizes amounts and banned phrases in lines', () => {
    const line = sanitizePersonalizationLine('즉시 매수하고 1,234,567원 투자');
    expect(line).not.toContain('즉시 매수');
    expect(line).toContain('[금액 생략]');
  });

  it('builds summary with hint when patterns or open items exist', () => {
    const summary = buildPersonalizationContextSummary(
      baseContext({
        currentWorkload: {
          openActionItemCount: 2,
          staleActionItemCount: 1,
          riskReviewCount: 1,
          topOpenActions: [{ title: '리스크 점검' }],
        },
        qualityMeta: { sources: ['action_items'], missingSources: [], readOnly: true },
      }),
    );
    expect(summary.openActionItemCount).toBe(2);
    expect(summary.hint).toMatch(/참고만/);
  });
});
