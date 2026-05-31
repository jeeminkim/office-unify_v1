import { describe, expect, it } from 'vitest';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import {
  classifyTodayCandidateQueue,
  queueLabelForBucket,
  summarizeQueueDiagnostics,
} from '@/lib/server/todayCandidateQueuePolicy';

function candidate(overrides: Partial<TodayStockCandidate> = {}): TodayStockCandidate {
  return {
    candidateId: 'c-1',
    name: 'HLB',
    market: 'KOSDAQ',
    country: 'KR',
    symbol: 'KR:028300',
    stockCode: '028300',
    source: 'user_context',
    score: 62,
    confidence: 'medium',
    riskLevel: 'medium',
    reasonSummary: '관찰 근거',
    reasonDetails: [],
    positiveSignals: [],
    cautionNotes: [],
    relatedUserContext: [],
    relatedWatchlistSymbols: [],
    isBuyRecommendation: false,
    ...overrides,
  };
}

describe('todayCandidateQueuePolicy', () => {
  it('classifies active corporate action risk as risk_review', () => {
    const out = classifyTodayCandidateQueue({
      candidate: candidate({
        corporateActionRisk: {
          active: true,
          riskType: 'rights_offering',
          headline: '유상증자 일정 확인',
          sourceLabel: 'manual_registry',
          effectiveFrom: '2026-06-01',
          expiresAt: null,
        },
        candidateAction: 'review_required',
      }),
    });
    expect(out.queueBucket).toBe('risk_review');
    expect(out.queueReasons).toContain('corporate_event_risk');
    expect(out.shouldIncludeInPrimaryDeck).toBe(true);
    expect(out.actionHint).toContain('리스크 점검');
  });

  it('moves reviewed active risk to monitoring instead of primary', () => {
    const out = classifyTodayCandidateQueue({
      candidate: candidate({
        briefDeckSlot: 'risk_review',
        candidateAction: 'reviewed_risk',
        corporateActionRisk: {
          active: true,
          riskType: 'rights_offering',
          headline: '유상증자 일정 확인',
          sourceLabel: 'manual_registry',
          effectiveFrom: '2026-06-01',
          expiresAt: null,
        },
        userFeedbackState: {
          action: 'mark_reviewed',
          active: true,
          createdAt: '2026-06-01T00:00:00.000Z',
          reviewedAt: '2026-06-01T00:00:00.000Z',
        },
      }),
    });
    expect(out.queueBucket).toBe('reviewed');
    expect(out.shouldIncludeInPrimaryDeck).toBe(false);
    expect(out.shouldIncludeInMonitoring).toBe(true);
    expect(queueLabelForBucket(out.queueBucket)).toBe('점검 완료 · 모니터링');
  });

  it('suppresses hide_7d and keeps keep_observing in monitoring when repeated', () => {
    const hidden = classifyTodayCandidateQueue({
      candidate: candidate({
        userFeedbackState: { action: 'hide_7d', active: true, createdAt: '2026-06-01T00:00:00.000Z' },
      }),
    });
    expect(hidden.queueBucket).toBe('suppressed');
    expect(hidden.shouldIncludeInPrimaryDeck).toBe(false);

    const observing = classifyTodayCandidateQueue({
      candidate: candidate({
        userFeedbackState: { action: 'keep_observing', active: true, createdAt: '2026-06-01T00:00:00.000Z' },
      }),
      repeatStat: { candidateRepeatCount7d: 3, lastShownAt: '2026-06-01T00:00:00.000Z', source: 'exposed_event' },
    });
    expect(observing.queueBucket).toBe('monitoring');
    expect(observing.shouldIncludeInPrimaryDeck).toBe(false);
    expect(observing.queueReasons).toContain('keep_observing');
  });

  it('moves 7-day repeated non-risk candidates to monitoring unless alternatives are insufficient', () => {
    const repeated = classifyTodayCandidateQueue({
      candidate: candidate({ candidateId: 'lotte-chem' }),
      repeatStat: { candidateRepeatCount7d: 7, lastShownAt: '2026-06-01T00:00:00.000Z', source: 'exposed_event' },
    });
    expect(repeated.queueBucket).toBe('monitoring');
    expect(repeated.shouldIncludeInPrimaryDeck).toBe(false);
    expect(repeated.actionHint).toContain('반복 노출');

    const fallback = classifyTodayCandidateQueue({
      candidate: candidate({ candidateId: 'lotte-chem' }),
      repeatStat: { candidateRepeatCount7d: 7, lastShownAt: '2026-06-01T00:00:00.000Z', source: 'exposed_event' },
      insufficientAlternatives: true,
    });
    expect(fallback.queueBucket).toBe('insufficient_alternative');
    expect(fallback.shouldIncludeInPrimaryDeck).toBe(true);
    expect(fallback.queueReasons).toContain('insufficient_alternatives');
  });

  it('classifies quote quality and US mapping gaps as data_check', () => {
    const quoteLow = classifyTodayCandidateQueue({
      candidate: candidate({
        dataQuality: {
          overall: 'low',
          badges: [],
          reasons: [],
          warnings: [],
          quoteReady: false,
        },
      }),
    });
    expect(quoteLow.queueBucket).toBe('data_check');
    expect(quoteLow.queueReasons).toContain('quote_quality_low');

    const usEmpty = classifyTodayCandidateQueue({
      candidate: candidate({ source: 'us_market_morning' }),
      usMappingEmpty: true,
    });
    expect(usEmpty.queueBucket).toBe('data_check');
    expect(usEmpty.queueReasons).toContain('us_mapping_empty');
  });

  it('links open risk Action Items to monitoring and summarizes diagnostics', () => {
    const risk = candidate({
      briefDeckSlot: 'risk_review',
      corporateActionRisk: {
        active: true,
        riskType: 'rights_offering',
        headline: '유상증자 일정 확인',
        sourceLabel: 'manual_registry',
        effectiveFrom: '2026-06-01',
        expiresAt: null,
      },
    });
    const out = classifyTodayCandidateQueue({ candidate: risk, openActionItemExists: true });
    expect(out.queueBucket).toBe('monitoring');
    expect(out.queueReasons).toContain('open_action_item_exists');
    expect(out.shouldIncludeInPrimaryDeck).toBe(false);

    const summary = summarizeQueueDiagnostics(
      [{ ...risk, queueBucket: 'risk_review', queueReasons: ['corporate_event_risk'] }],
      [{ ...risk, queueBucket: 'monitoring', queueReasons: ['open_action_item_exists'] }],
      1,
    );
    expect(summary.bucketCounts.risk_review).toBe(1);
    expect(summary.monitoringCount).toBe(1);
    expect(summary.primarySuppressedCount).toBe(1);
  });

  it('does not introduce buy/sell or auto-order copy', () => {
    const out = classifyTodayCandidateQueue({ candidate: candidate() });
    expect(JSON.stringify(out)).not.toMatch(/매수 후보|매도 지시|자동 주문|자동 리밸런싱|기관 추천/);
  });
});
