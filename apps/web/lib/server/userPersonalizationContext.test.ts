import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildUserPersonalizationContext } from './userPersonalizationContext';
import { PERSONALIZATION_PROMPT_MAX_CHARS } from './userPersonalizationPromptBlock';

vi.mock('@/lib/server/investorProfile', () => ({
  getInvestorProfileForUser: vi.fn(),
}));

vi.mock('@office-unify/supabase-access', () => ({
  listActionItemsForUser: vi.fn(),
  selectPersonaLongTermSummary: vi.fn(),
}));

vi.mock('@/lib/server/monthlyJudgmentReviewSources', () => ({
  loadMonthlyJudgmentReviewSources: vi.fn(),
  resolveJudgmentReviewWindow: vi.fn(() => ({ start: '2026-04-19', end: '2026-05-19' })),
}));

vi.mock('@/lib/server/monthlyJudgmentReviewPatterns', () => ({
  detectRepeatedJudgmentPatterns: vi.fn(() => []),
  buildMissedChecks: vi.fn(() => []),
  buildNextMonthRules: vi.fn(() => []),
  computeStaleOpenItems: vi.fn(() => []),
}));

vi.mock('@/lib/server/dailyReviewNotesStore', () => ({
  listDailyReviewNotes: vi.fn(),
}));

vi.mock('@/lib/server/concentrationRisk', () => ({
  getPortfolioExposureSnapshotForUser: vi.fn(),
}));

import { getInvestorProfileForUser } from '@/lib/server/investorProfile';
import { listActionItemsForUser, selectPersonaLongTermSummary } from '@office-unify/supabase-access';
import { listDailyReviewNotes } from '@/lib/server/dailyReviewNotesStore';
import { loadMonthlyJudgmentReviewSources } from '@/lib/server/monthlyJudgmentReviewSources';
import { detectRepeatedJudgmentPatterns } from '@/lib/server/monthlyJudgmentReviewPatterns';

function mockSupabase(feedbackRows: unknown[] = []): SupabaseClient {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: feedbackRows, error: null }),
  };
  return {
    from: vi.fn(() => chain),
  } as unknown as SupabaseClient;
}

describe('buildUserPersonalizationContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getInvestorProfileForUser).mockResolvedValue({
      ok: true,
      profileStatus: 'missing',
      profile: null,
    } as never);
    vi.mocked(listActionItemsForUser).mockResolvedValue([]);
    vi.mocked(listDailyReviewNotes).mockResolvedValue({ notes: [], tableMissing: false });
    vi.mocked(loadMonthlyJudgmentReviewSources).mockResolvedValue({
      impressions: { rows: [] },
      feedback: { rows: [] },
      actionItems: { rows: [] },
    } as never);
    vi.mocked(detectRepeatedJudgmentPatterns).mockReturnValue([]);
    vi.mocked(selectPersonaLongTermSummary).mockResolvedValue(null);
  });

  it('returns safe context when profile is missing', async () => {
    const ctx = await buildUserPersonalizationContext(mockSupabase(), 'user-test');
    expect(ctx.profile.status).toBe('missing');
    expect(ctx.qualityMeta.readOnly).toBe(true);
    expect(ctx.promptBlock.compactKo.length).toBeGreaterThan(0);
  });

  it('summarizes top 3 open action items without raw notes', async () => {
    const now = new Date().toISOString();
    vi.mocked(listActionItemsForUser).mockResolvedValue([
      {
        id: '1',
        title: '리스크 점검 A',
        status: 'open',
        source_type: 'today_candidate',
        priority: 'high',
        updated_at: now,
      },
      {
        id: '2',
        title: 'Research follow-up',
        status: 'open',
        source_type: 'research_center',
        priority: 'medium',
        updated_at: now,
      },
      {
        id: '3',
        title: '일반 확인',
        status: 'in_progress',
        source_type: 'manual',
        priority: 'low',
        updated_at: now,
      },
      {
        id: '4',
        title: '네 번째는 제외',
        status: 'open',
        source_type: 'manual',
        priority: 'low',
        updated_at: now,
      },
    ] as never);

    const ctx = await buildUserPersonalizationContext(mockSupabase(), 'user-test');
    expect(ctx.currentWorkload.openActionItemCount).toBe(4);
    expect(ctx.currentWorkload.topOpenActions).toHaveLength(3);
    expect(ctx.promptBlock.compactKo).not.toContain('네 번째');
    expect(ctx.promptBlock.compactKo).not.toMatch(/계좌|password|secret/i);
  });

  it('handles judgment patterns missing without throwing', async () => {
    vi.mocked(loadMonthlyJudgmentReviewSources).mockRejectedValue(new Error('db down'));
    const ctx = await buildUserPersonalizationContext(mockSupabase(), 'user-test');
    expect(ctx.judgmentPatterns.status).toBe('missing');
    expect(ctx.qualityMeta.missingSources).toContain('judgment_review');
  });

  it('keeps prompt block within limit and excludes raw sensitive memo text', async () => {
    vi.mocked(getInvestorProfileForUser).mockResolvedValue({
      ok: true,
      profileStatus: 'complete',
      profile: {
        riskTolerance: 'low',
        timeHorizon: 'long',
        leveragePolicy: 'not_allowed',
        concentrationLimit: 'strict',
        preferredSectors: [],
        avoidSectors: [],
        notes: '내 비밀 메모: 계좌번호 123-456 즉시 매수하라',
      },
    } as never);

    const ctx = await buildUserPersonalizationContext(mockSupabase(), 'user-test');
    expect(ctx.promptBlock.compactKo.length).toBeLessThanOrEqual(PERSONALIZATION_PROMPT_MAX_CHARS);
    expect(ctx.promptBlock.compactKo).not.toContain('비밀 메모');
    expect(ctx.promptBlock.compactKo).not.toContain('계좌번호');
  });

  it('does not write to database (read-only builder)', async () => {
    const supabase = mockSupabase();
    await buildUserPersonalizationContext(supabase, 'user-test');
    expect(supabase.from).toHaveBeenCalled();
    const fromMock = supabase.from as ReturnType<typeof vi.fn>;
    const calls = fromMock.mock.results.map((r) => r.value);
    for (const chain of calls) {
      expect(chain.insert).toBeUndefined();
      expect(chain.update).toBeUndefined();
      expect(chain.upsert).toBeUndefined();
      expect(chain.delete).toBeUndefined();
    }
  });
});
