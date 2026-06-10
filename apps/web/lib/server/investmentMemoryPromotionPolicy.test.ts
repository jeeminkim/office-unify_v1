import { describe, expect, it } from 'vitest';
import type { PbDailyConversationMemoryCandidate, PbDailyConversationSummary } from '@office-unify/shared-types';
import { evaluateMemoryPromotionCandidate } from './investmentMemoryPromotionPolicy';

function candidate(overrides: Partial<PbDailyConversationMemoryCandidate> = {}): PbDailyConversationMemoryCandidate {
  return {
    memoryType: 'watching_thesis',
    memoryKey: 'watching_thesis:ai_power_infra_ls_일진전기',
    title: 'AI 전력 인프라 thesis 관찰',
    content: 'AI 전력 인프라 thesis는 수주와 실적 확인 전까지 계속 보고 싶은 중요한 기준이다.',
    relatedSymbols: ['LS', '일진전기'],
    relatedThemes: ['AI 전력 인프라'],
    evidence: {
      source: 'pb_daily_conversation',
      templateType: 'daily_checkin',
      actionCategory: 'watch',
      userIntent: '관망하되 thesis 확인',
      emotionalState: '확신과 불안이 섞임',
      confidenceLevel: 'unknown',
      extractedAt: '2026-06-11T00:00:00.000Z',
      relation: 'supporting',
    },
    promotionScore: 50,
    promotionReason: 'candidate kept for repeated evidence check',
    ...overrides,
  };
}

function summary(theme = 'AI 전력 인프라'): PbDailyConversationSummary {
  return {
    templateType: 'daily_checkin',
    userIntent: 'AI 전력 인프라 관찰',
    actionCategory: 'watch',
    symbols: ['LS'],
    themes: [theme],
    emotionalState: '불안',
    confidenceLevel: 'unknown',
    thesisSnapshot: {},
    riskSnapshot: {},
    nextCheckpoints: ['수주와 실적 확인'],
    memoryCandidates: [],
  };
}

describe('evaluateMemoryPromotionCandidate', () => {
  it('promotes an anchored repeated thesis with explicit criteria', () => {
    const decision = evaluateMemoryPromotionCandidate({
      candidate: candidate(),
      recentDailyConversations: [summary(), summary()],
      existingMemories: [],
      now: new Date('2026-06-11T00:00:00.000Z'),
    });

    expect(decision.action).toBe('promote_new');
    expect(decision.shouldPromote).toBe(true);
    expect(decision.score).toBeGreaterThanOrEqual(70);
    expect(decision.reasons).toContain('same theme repeated within recent PB summaries');
  });

  it('reinforces an existing same type/key memory', () => {
    const decision = evaluateMemoryPromotionCandidate({
      candidate: candidate({ promotionScore: 42 }),
      recentDailyConversations: [],
      existingMemories: [
        {
          id: 'mem-1',
          memoryType: 'watching_thesis',
          memoryKey: 'watching_thesis:ai_power_infra_ls_일진전기',
          occurrenceCount: 3,
        },
      ],
      now: new Date('2026-06-11T00:00:00.000Z'),
    });

    expect(decision.action).toBe('reinforce_existing');
    expect(decision.shouldUpdateExisting).toBe(true);
    expect(decision.targetMemoryId).toBe('mem-1');
  });

  it('skips weak single-news reactions below threshold', () => {
    const decision = evaluateMemoryPromotionCandidate({
      candidate: candidate({
        memoryType: 'decision_style',
        memoryKey: 'decision_style:single_news',
        content: '오늘 뉴스 때문에 그냥 오를 것 같다는 느낌이 든다.',
        relatedSymbols: [],
        relatedThemes: [],
        promotionScore: 35,
      }),
      recentDailyConversations: [],
      existingMemories: [],
      now: new Date('2026-06-11T00:00:00.000Z'),
    });

    expect(decision.action).toBe('skip');
    expect(decision.shouldPromote).toBe(false);
  });
});
