import { describe, expect, it } from 'vitest';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import { resolveCorporateActionRiskForStockCode } from '@/lib/server/corporateActionRiskRegistry';
import { applyCorporateActionRiskGate } from '@/lib/server/todayCandidateScoring';
import {
  buildDecisionTraceForDeckCandidate,
  enrichDeckWithDecisionTraces,
} from '@/lib/server/todayCandidateDecisionTrace';
import { computeCandidateJudgmentQuality } from '@/lib/server/todayCandidateJudgmentQuality';

function baseCand(partial: Partial<TodayStockCandidate>): TodayStockCandidate {
  return {
    candidateId: 't1',
    name: '테스트',
    market: 'KOSPI',
    country: 'KR',
    source: 'user_context',
    score: 55,
    confidence: 'medium',
    riskLevel: 'medium',
    reasonSummary: '관찰',
    reasonDetails: [],
    positiveSignals: [],
    cautionNotes: [],
    relatedUserContext: [],
    relatedWatchlistSymbols: [],
    isBuyRecommendation: false,
    stockCode: '000000',
    ...partial,
  };
}

describe('todayCandidateDecisionTrace', () => {
  it('selected deck candidate gets decisionTrace with selected status', () => {
    const c = baseCand({
      candidateId: 'x',
      dataQuality: {
        overall: 'medium',
        badges: [],
        reasons: [],
        warnings: [],
        quoteReady: true,
      } as TodayStockCandidate['dataQuality'],
    });
    const trace = buildDecisionTraceForDeckCandidate({
      c,
      usCoverageStatus: 'ok',
      profileStatus: 'complete',
    });
    expect(trace.decisionStatus).toBe('selected');
    expect(trace.selectedReasons.length).toBeGreaterThan(0);
  });

  it('HLB-style corporate risk: risk_review, cap 50, corporate_action_risk flag, no chase wording', () => {
    const snap = resolveCorporateActionRiskForStockCode('028300');
    expect(snap?.active).toBe(true);
    let c = baseCand({
      stockCode: '028300',
      corporateActionRisk: snap,
      briefDeckSlot: 'risk_review',
      scoreBreakdown: {
        baseScore: 60,
        watchlistBoost: 0,
        sectorBoost: 0,
        usSignalBoost: 0,
        quoteQualityPenalty: 0,
        repeatExposurePenalty: 0,
        corporateActionPenalty: 0,
        riskPenalty: 0,
        finalScore: 60,
      },
    });
    c = applyCorporateActionRiskGate(c);
    expect(c.score).toBeLessThanOrEqual(50);
    const trace = buildDecisionTraceForDeckCandidate({
      c,
      usCoverageStatus: 'ok',
      profileStatus: 'complete',
    });
    expect(trace.decisionStatus).toBe('risk_review');
    expect(trace.scoreCapApplied).toBe(50);
    expect(trace.riskFlags.some((r) => r.code === 'corporate_action_risk')).toBe(true);
    expect(trace.doNotDo.some((x) => x.includes('추격'))).toBe(true);
    expect(trace.doNotDo.join(' ')).not.toMatch(/매수|매도/);
  });

  it('US degraded adds missingEvidence on us mapped candidate', () => {
    const c = baseCand({
      source: 'us_market_morning',
      dataQuality: { quoteReady: true } as TodayStockCandidate['dataQuality'],
    });
    const trace = buildDecisionTraceForDeckCandidate({
      c,
      usCoverageStatus: 'degraded',
      profileStatus: 'complete',
    });
    expect(trace.missingEvidence.some((m) => m.code === 'us_coverage_degraded')).toBe(true);
    const jq = computeCandidateJudgmentQuality(c, {
      usCoverageStatus: 'degraded',
      profileStatus: 'complete',
      repeatByCandidateId: new Map(),
    });
    expect(jq.penalties.some((p) => p.includes('미국'))).toBe(true);
  });

  it('enrichDeckWithDecisionTraces adds summary + suppressed pool', () => {
    const deck = [
      baseCand({ candidateId: 'd1', stockCode: '111', score: 90, dataQuality: { overall: 'medium', badges: [], reasons: [], warnings: [], quoteReady: true } as TodayStockCandidate['dataQuality'] }),
    ];
    const pool = [
      ...deck,
      baseCand({
        candidateId: 'p2',
        stockCode: '222',
        score: 10,
        confidence: 'medium',
        dataQuality: {
          overall: 'medium',
          badges: [],
          reasons: [],
          warnings: [],
          quoteReady: true,
        } as TodayStockCandidate['dataQuality'],
      }),
    ];
    const rep = new Map([
      ['p2', { candidateRepeatCount7d: 8, lastShownAt: null, source: 'exposed_event' as const }],
    ]);
    const out = enrichDeckWithDecisionTraces({
      deck,
      pool,
      repeatByCandidateId: rep,
      usCoverageStatus: 'ok',
      profileStatus: 'complete',
      usKrEmpty: false,
      usSignalCount: 0,
      maxSuppressed: 5,
    });
    expect(out.deck[0]?.decisionTrace?.decisionStatus).toBe('selected');
    expect(out.suppressedCandidates.length).toBeGreaterThan(0);
    expect(out.summary.traceCoverageRatio).toBe(1);
  });
});
