import { describe, expect, it, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  buildMonthlyJudgmentReview: vi.fn(),
  getServiceSupabase: vi.fn(() => ({})),
}));

vi.mock('@/lib/server/persona-chat-auth', () => ({
  requirePersonaChatAuth: vi.fn(async () => ({ ok: true as const, userKey: 'u-test' })),
}));

vi.mock('@/lib/server/supabase-service', () => ({
  getServiceSupabase: hoisted.getServiceSupabase,
}));

vi.mock('@/lib/server/monthlyJudgmentReview', () => ({
  buildMonthlyJudgmentReview: hoisted.buildMonthlyJudgmentReview,
  buildMonthlyJudgmentReviewIdempotencyKey: vi.fn(() => 'monthly-judgment-review:u-test:2026-04-18_2026-05-18'),
  buildMonthlyJudgmentReviewWindowKey: vi.fn(() => '2026-04-18_2026-05-18'),
  resolveJudgmentReviewWindow: vi.fn(() => ({
    startDate: '2026-04-18',
    endDate: '2026-05-18',
    days: 30,
  })),
}));

import { GET } from './route';

const sampleReview = {
  window: { startDate: '2026-04-18', endDate: '2026-05-18', days: 30 },
  status: 'ready' as const,
  headline: { summary: 'test', primaryPattern: 'balanced' as const, confidence: 'low' as const },
  metrics: {
    todayCandidateCount: 1,
    riskReviewCount: 0,
    actionItemCreatedCount: 0,
    actionItemDoneCount: 0,
    actionItemDismissedCount: 0,
    actionItemCompletionRatio: 0,
    tradeJournalCount: 0,
    retrospectiveCount: 0,
    researchReportCount: 0,
    reportDiffCount: 0,
    committeeRoadmapCount: 0,
    watchlistRecommendationApprovedCount: 0,
    watchlistRecommendationRejectedCount: 0,
  },
  repeatedPatterns: [],
  missedChecks: [],
  improvedBehaviors: [],
  actionQueueReview: { overdueCount: 0, doneCount: 0, dismissedCount: 0, staleOpenItems: [] },
  portfolioBehaviorSignals: {
    concentrationWarnings: [],
    leverageWarnings: [],
    repeatedSectorMentions: [],
    symbolsMentionedOften: [],
  },
  nextMonthRules: [],
  qualityMeta: {
    dataCoverage: {
      todayCandidates: 'ok' as const,
      actionItems: 'ok' as const,
      tradeJournal: 'partial' as const,
      retrospectives: 'partial' as const,
      researchReports: 'partial' as const,
      committee: 'partial' as const,
    },
    warnings: [],
    readOnlyPreview: true,
    generatedAt: new Date().toISOString(),
  },
};

describe('GET /api/judgment-review/monthly', () => {
  beforeEach(() => {
    hoisted.buildMonthlyJudgmentReview.mockReset();
    hoisted.buildMonthlyJudgmentReview.mockResolvedValue(sampleReview);
  });

  it('returns read-only preview without writing', async () => {
    const res = await GET(new Request('http://localhost/api/judgment-review/monthly?days=30'));
    const json = (await res.json()) as { ok?: boolean; review?: { qualityMeta?: { readOnlyPreview?: boolean } } };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.review?.qualityMeta?.readOnlyPreview).toBe(true);
    expect(hoisted.buildMonthlyJudgmentReview).toHaveBeenCalledWith(
      expect.objectContaining({ readOnlyPreview: true }),
    );
  });
});
