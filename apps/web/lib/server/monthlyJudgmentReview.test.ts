import { describe, expect, it } from 'vitest';
import { assembleMonthlyJudgmentReview } from '@/lib/server/monthlyJudgmentReview';
import {
  detectRepeatedJudgmentPatterns,
  buildNextMonthRules,
  buildMonthlyReviewActionItems,
} from '@/lib/server/monthlyJudgmentReviewPatterns';
import type { MonthlyJudgmentReviewSources } from '@/lib/server/monthlyJudgmentReviewSources';

function emptySources(overrides: Partial<MonthlyJudgmentReviewSources> = {}): MonthlyJudgmentReviewSources {
  const window = { startDate: '2026-04-18', endDate: '2026-05-18', days: 30 };
  return {
    window,
    impressions: { rows: [], tableMissing: false },
    feedback: { rows: [], tableMissing: false },
    actionItems: { rows: [], tableMissing: false },
    tradeJournal: { rows: [], tableMissing: false },
    retrospectives: { rows: [], tableMissing: false },
    researchRuns: { rows: [], tableMissing: false },
    researchDiffs: { rows: [], tableMissing: false },
    sectorRadarRuns: { rows: [], tableMissing: false },
    watchlistRecommendations: { rows: [], tableMissing: false },
    dailyReviewNotes: { rows: [], tableMissing: true },
    ...overrides,
  };
}

describe('assembleMonthlyJudgmentReview', () => {
  it('returns partial when some sources missing', () => {
    const review = assembleMonthlyJudgmentReview(
      emptySources({
        impressions: { rows: [], tableMissing: true },
        actionItems: { rows: [], tableMissing: true },
      }),
      true,
    );
    expect(review.status).toBe('insufficient_data');
    expect(review.qualityMeta.dataCoverage.todayCandidates).toBe('missing');
    expect(review.qualityMeta.readOnlyPreview).toBe(true);
  });

  it('detects action_queue_stall pattern', () => {
    const sources = emptySources({
      actionItems: {
        tableMissing: false,
        rows: [
          ...Array.from({ length: 6 }, (_, i) => ({
            id: `o${i}`,
            user_key: 'u',
            title: `open ${i}`,
            description: null,
            status: 'open' as const,
            priority: 'medium' as const,
            source_type: 'manual' as const,
            source_id: null,
            source_label: null,
            source_href: null,
            symbol: null,
            links_json: {},
            detail_json: {},
            idempotency_key: null,
            dedupe_title_norm: `open ${i}`,
            created_at: '2026-05-01T00:00:00Z',
            updated_at: '2026-05-01T00:00:00Z',
            completed_at: null,
          })),
          {
            id: 'd1',
            user_key: 'u',
            title: 'done one',
            description: null,
            status: 'done',
            priority: 'medium',
            source_type: 'manual',
            source_id: null,
            source_label: null,
            source_href: null,
            symbol: null,
            links_json: {},
            detail_json: {},
            idempotency_key: null,
            dedupe_title_norm: 'done one',
            created_at: '2026-05-02T00:00:00Z',
            updated_at: '2026-05-02T00:00:00Z',
            completed_at: '2026-05-02T00:00:00Z',
          },
        ] as MonthlyJudgmentReviewSources['actionItems']['rows'],
      },
    });
    const patterns = detectRepeatedJudgmentPatterns(sources);
    expect(patterns.some((p) => p.patternKey === 'action_queue_stall')).toBe(true);
  });

  it('detects risk_review_ignored when risk impressions without mark_reviewed', () => {
    const sources = emptySources({
      impressions: {
        tableMissing: false,
        rows: [
          {
            symbol: '005930',
            name: '삼성',
            run_date: '2026-05-10',
            judgment_quality_level: 'low',
            candidate_bucket: 'risk_review',
            decision_status: 'selected',
            suppressed_reasons: [],
            rejected_reasons: [],
            missing_evidence: [],
            decision_trace: { riskFlags: [{ code: 'risk_x' }] },
          },
          {
            symbol: '000660',
            name: 'SK',
            run_date: '2026-05-11',
            judgment_quality_level: 'low',
            candidate_bucket: 'risk_review',
            decision_status: 'selected',
            suppressed_reasons: [],
            rejected_reasons: [],
            missing_evidence: [],
            decision_trace: {},
          },
          {
            symbol: '035420',
            name: 'NAVER',
            run_date: '2026-05-12',
            judgment_quality_level: 'medium',
            candidate_bucket: 'risk_review',
            decision_status: 'selected',
            suppressed_reasons: [],
            rejected_reasons: [],
            missing_evidence: [],
            decision_trace: {},
          },
        ],
      },
      feedback: { rows: [], tableMissing: false },
    });
    const patterns = detectRepeatedJudgmentPatterns(sources);
    expect(patterns.some((p) => p.patternKey === 'risk_review_ignored')).toBe(true);
  });

  it('detects over_researching pattern', () => {
    const sources = emptySources({
      researchRuns: {
        tableMissing: false,
        rows: Array.from({ length: 6 }, (_, i) => ({
          id: `r${i}`,
          symbol: `SYM${i}`,
          report_date: '2026-05-10',
          generated_at: '2026-05-10T00:00:00Z',
        })),
      },
      actionItems: { rows: [], tableMissing: false },
      retrospectives: { rows: [], tableMissing: false },
    });
    const patterns = detectRepeatedJudgmentPatterns(sources);
    expect(patterns.some((p) => p.patternKey === 'over_researching')).toBe(true);
  });

  it('detects under_reviewing pattern', () => {
    const sources = emptySources({
      tradeJournal: {
        tableMissing: false,
        rows: [
          { id: 'j1', symbol: 'A', tradeDate: '2026-05-01' } as never,
          { id: 'j2', symbol: 'B', tradeDate: '2026-05-02' } as never,
        ],
      },
      retrospectives: { rows: [], tableMissing: false },
    });
    const patterns = detectRepeatedJudgmentPatterns(sources);
    expect(patterns.some((p) => p.patternKey === 'under_reviewing')).toBe(true);
  });

  it('builds improvedBehaviors for mark_reviewed and done', () => {
    const review = assembleMonthlyJudgmentReview(
      emptySources({
        feedback: {
          tableMissing: false,
          rows: [{ symbol: 'A', candidate_id: 'c1', feedback_action: 'mark_reviewed', created_at: '2026-05-10' }],
        },
        actionItems: {
          tableMissing: false,
          rows: [
            {
              id: '1',
              user_key: 'u',
              title: 'done',
              description: null,
              status: 'done',
              priority: 'medium',
              source_type: 'today_candidate',
              source_id: 'c1',
              source_label: null,
              source_href: null,
              symbol: 'A',
              links_json: {},
              detail_json: {},
              idempotency_key: null,
              dedupe_title_norm: 'done',
              created_at: '2026-05-10',
              updated_at: '2026-05-11',
              completed_at: '2026-05-11',
            },
          ] as MonthlyJudgmentReviewSources['actionItems']['rows'],
        },
      }),
      true,
    );
    expect(review.improvedBehaviors.length).toBeGreaterThan(0);
  });

  it('nextMonthRules always have notTradeInstruction true', () => {
    const patterns = detectRepeatedJudgmentPatterns(
      emptySources({
        actionItems: {
          tableMissing: false,
          rows: Array.from({ length: 6 }, (_, i) => ({
            id: `o${i}`,
            user_key: 'u',
            title: `t${i}`,
            description: null,
            status: 'open' as const,
            priority: 'medium' as const,
            source_type: 'manual' as const,
            source_id: null,
            source_label: null,
            source_href: null,
            symbol: null,
            links_json: {},
            detail_json: {},
            idempotency_key: null,
            dedupe_title_norm: `t${i}`,
            created_at: '2026-05-01',
            updated_at: '2026-05-01',
            completed_at: null,
          })) as MonthlyJudgmentReviewSources['actionItems']['rows'],
        },
      }),
    );
    const rules = buildNextMonthRules(patterns);
    for (const r of rules) {
      expect(r.notTradeInstruction).toBe(true);
    }
    const items = buildMonthlyReviewActionItems(rules);
    expect(items.every((i) => !/(매수|매도|자동\s*주문)/.test(i.title))).toBe(true);
  });

  it('headline does not center on returns', () => {
    const review = assembleMonthlyJudgmentReview(emptySources(), true);
    expect(review.headline.summary).not.toMatch(/수익률.*1위|잘한 종목/);
  });
});
