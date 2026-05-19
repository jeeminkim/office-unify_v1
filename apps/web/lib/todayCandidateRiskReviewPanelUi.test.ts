import { describe, expect, it } from 'vitest';
import { buildRiskReviewActions } from '@/lib/server/todayCandidateRiskReviewActions';
import { resolveCorporateActionRiskForStockCode } from '@/lib/server/corporateActionRiskRegistry';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import {
  isRiskReviewNavigateAction,
  orderedRiskReviewActionsForUi,
  resolveRiskReviewActionHref,
  riskReviewActionButtonLabel,
} from '@/lib/todayCandidateRiskReviewPanelUi';

function hlb(): TodayStockCandidate {
  const corp = resolveCorporateActionRiskForStockCode('028300')!;
  return {
    candidateId: 'hlb-ui',
    name: 'HLB',
    market: 'KOSPI',
    stockCode: '028300',
    source: 'watchlist',
    score: 48,
    confidence: 'medium',
    riskLevel: 'high',
    reasonSummary: '기업 이벤트',
    reasonDetails: [],
    positiveSignals: [],
    cautionNotes: [],
    relatedUserContext: [],
    relatedWatchlistSymbols: [],
    isBuyRecommendation: false,
    corporateActionRisk: corp,
    candidateAction: 'review_required',
    briefDeckSlot: 'risk_review',
    decisionTrace: { decisionStatus: 'risk_review', selectedReasons: [], downgradeReasons: [], riskFlags: [], missingEvidence: [], nextChecks: [], doNotDo: [] },
  };
}

describe('todayCandidateRiskReviewPanelUi', () => {
  it('check_disclosure resolves research seed href when href missing', () => {
    const c = hlb();
    const actions = buildRiskReviewActions(c);
    const disc = actions.find((a) => a.actionKey === 'check_disclosure');
    expect(disc).toBeDefined();
    expect(isRiskReviewNavigateAction(disc!)).toBe(true);
    const href = resolveRiskReviewActionHref(disc!, c);
    expect(href).toContain('/research-center');
    expect(href).toContain('riskReview=1');
    expect(riskReviewActionButtonLabel(disc!)).toBe('공시 확인');
  });

  it('external_hint style actions use disclosure label', () => {
    const c = hlb();
    const actions = buildRiskReviewActions(c);
    const disc = actions.find((a) => a.actionType === 'external_hint');
    expect(disc).toBeDefined();
    expect(riskReviewActionButtonLabel(disc!)).toBe('공시 확인');
  });

  it('ordered actions include navigate keys for UI', () => {
    const c = hlb();
    const actions = orderedRiskReviewActionsForUi(buildRiskReviewActions(c));
    const keys = actions.map((a) => a.actionKey);
    expect(keys).toContain('check_disclosure');
    expect(keys).toContain('generate_research_report');
    expect(keys).toContain('create_trade_journal_seed');
  });

  it('action labels avoid auto-trading wording', () => {
    const c = hlb();
    const blob = JSON.stringify(buildRiskReviewActions(c));
    expect(blob).not.toMatch(/자동매매|자동 주문|자동 리밸런싱/);
  });
});
