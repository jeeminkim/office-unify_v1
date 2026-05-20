import { describe, expect, it, vi } from 'vitest';
import {
  applyTodayCandidateFeedbackToDeck,
  buildTodayCandidateFeedbackSummary,
  buildTodayCandidateFeedbackIdempotencyKey,
  indexActiveFeedbackByCandidateKey,
  saveTodayCandidateFeedback,
} from '@/lib/server/todayCandidateFeedbackStore';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';

function baseCandidate(overrides: Partial<TodayStockCandidate> = {}): TodayStockCandidate {
  return {
    candidateId: 'c-1',
    name: 'HLB',
    market: 'KOSPI',
    country: 'KR',
    stockCode: '028300',
    source: 'watchlist',
    score: 48,
    confidence: 'medium',
    riskLevel: 'high',
    reasonSummary: 'test',
    reasonDetails: [],
    positiveSignals: [],
    cautionNotes: [],
    relatedUserContext: [],
    relatedWatchlistSymbols: [],
    isBuyRecommendation: false,
    ...overrides,
  };
}

describe('todayCandidateFeedbackStore', () => {
  it('builds deterministic idempotency key', () => {
    const k = buildTodayCandidateFeedbackIdempotencyKey({
      userKey: 'u1',
      action: 'hide_7d',
      symbolOrCandidateId: '028300',
      ymd: '2026-05-17',
    });
    expect(k).toContain('today-candidate-feedback:u1:hide_7d:028300:2026-05-17');
  });

  it('hide_7d active suppresses non-critical candidate from deck', () => {
    const now = new Date().toISOString();
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const byKey = indexActiveFeedbackByCandidateKey([
      {
        id: 'f1',
        user_key: 'u1',
        candidate_id: 'c-1',
        symbol: '028300',
        feedback_action: 'hide_7d',
        effective_from: now,
        effective_until: until,
        idempotency_key: 'k1',
        created_at: now,
      },
    ]);
    const { deck, suppressedTraces } = applyTodayCandidateFeedbackToDeck([baseCandidate()], byKey);
    expect(deck.length).toBe(0);
    expect(suppressedTraces.some((t) => t.suppressedReasons.some((r) => r.code === 'user_hidden_7d'))).toBe(true);
  });

  it('mark_reviewed attaches userFeedbackState', () => {
    const now = new Date().toISOString();
    const byKey = indexActiveFeedbackByCandidateKey([
      {
        id: 'f2',
        user_key: 'u1',
        candidate_id: 'c-1',
        symbol: '028300',
        feedback_action: 'mark_reviewed',
        effective_from: now,
        effective_until: null,
        idempotency_key: 'k2',
        created_at: now,
      },
    ]);
    const { deck } = applyTodayCandidateFeedbackToDeck([baseCandidate()], byKey);
    expect(deck[0]?.userFeedbackState?.action).toBe('mark_reviewed');
    expect(deck[0]?.decisionTrace?.userFeedbackApplied).toBe(true);
  });

  it('mark_reviewed risk candidate moves out of main deck into reviewed risk list', () => {
    const now = new Date().toISOString();
    const byKey = indexActiveFeedbackByCandidateKey([
      {
        id: 'f-risk',
        user_key: 'u1',
        candidate_id: 'c-1',
        symbol: '028300',
        feedback_action: 'mark_reviewed',
        effective_from: now,
        effective_until: null,
        idempotency_key: 'k-risk',
        created_at: now,
      },
    ]);
    const { deck, reviewedRiskCandidates, suppressedTraces } = applyTodayCandidateFeedbackToDeck(
      [
        baseCandidate({
          briefDeckSlot: 'risk_review',
          candidateAction: 'review_required',
          corporateActionRisk: {
            active: true,
            riskType: 'rights_offering',
            headline: 'risk',
            sourceLabel: 'manual',
            effectiveFrom: now,
            expiresAt: null,
          },
        }),
      ],
      byKey,
    );
    expect(deck).toHaveLength(0);
    expect(reviewedRiskCandidates[0]?.candidateAction).toBe('reviewed_risk');
    expect(reviewedRiskCandidates[0]?.userFeedbackState?.reviewedAt).toBe(now);
    expect(suppressedTraces.some((t) => t.suppressedReasons.some((r) => r.code === 'user_marked_reviewed'))).toBe(true);
  });

  it('feedback summary exposes additive semantic counts', () => {
    const now = new Date().toISOString();
    const summary = buildTodayCandidateFeedbackSummary(
      [
        baseCandidate({
          candidateAction: 'reviewed_risk',
          corporateActionRisk: {
            active: true,
            riskType: 'rights_offering',
            headline: 'risk',
            sourceLabel: 'manual',
            effectiveFrom: now,
            expiresAt: null,
          },
          userFeedbackState: { action: 'mark_reviewed', createdAt: now, reviewedAt: now, active: true },
        }),
      ],
      1,
      false,
      { reviewedRiskSuppressedCount: 1 },
    );
    expect(summary.reviewedRiskCount).toBe(1);
    expect(summary.reviewedRiskSuppressedCount).toBe(1);
  });

  it('saveTodayCandidateFeedback sets effectiveUntil ~7d for hide_7d', async () => {
    const insert = vi.fn().mockResolvedValue({
      data: { id: 'new-id', effective_until: new Date(Date.now() + 7 * 86400000).toISOString() },
      error: null,
    });
    const supabase = { from: () => ({ insert: () => ({ select: () => ({ maybeSingle: insert }) }) }) };
    const res = await saveTodayCandidateFeedback({
      supabase: supabase as never,
      userKey: 'u1',
      body: { action: 'hide_7d', symbol: '028300' },
    });
    expect(res.ok).toBe(true);
    expect(res.status).toBe('saved');
    expect(res.effectiveUntil).toBeTruthy();
  });

  it('saveTodayCandidateFeedback returns table_missing', async () => {
    const supabase = {
      from: () => ({
        insert: () => ({
          select: () => ({
            maybeSingle: async () => ({
              data: null,
              error: { message: 'today_candidate_feedback does not exist', code: '42P01' },
            }),
          }),
        }),
      }),
    };
    const res = await saveTodayCandidateFeedback({
      supabase: supabase as never,
      userKey: 'u1',
      body: { action: 'mark_reviewed', candidateId: 'c-1' },
    });
    expect(res.status).toBe('table_missing');
    expect(res.actionHint).toContain('append_today_candidate_feedback');
  });
});
