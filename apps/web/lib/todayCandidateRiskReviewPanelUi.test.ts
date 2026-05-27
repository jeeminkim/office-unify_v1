import { describe, expect, it } from 'vitest';
import { buildRiskReviewActions } from '@/lib/server/todayCandidateRiskReviewActions';
import { resolveCorporateActionRiskForStockCode } from '@/lib/server/corporateActionRiskRegistry';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import {
  isRiskReviewNavigateAction,
  orderedRiskReviewActionsForUi,
  resolveRiskReviewActionHref,
  resolveRiskReviewActionPresentation,
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
  it('check_disclosure without href explains the manual path without a clickable disclosure claim', () => {
    const c = hlb();
    const actions = buildRiskReviewActions(c);
    const disc = actions.find((a) => a.actionKey === 'check_disclosure');
    expect(disc).toBeDefined();
    expect(isRiskReviewNavigateAction(disc!)).toBe(true);
    const href = resolveRiskReviewActionHref(disc!, c);
    expect(href).toBeNull();
    expect(riskReviewActionButtonLabel(disc!, c)).toBe('공시 확인 방법');
    expect(resolveRiskReviewActionPresentation(disc!, c)).toMatchObject({
      href: null,
      label: '공시 확인 방법',
      afterClickExpectation: '공시 URL이 없어 확인 방법만 안내합니다.',
      isVerifiedDisclosure: false,
    });
  });

  it('external_hint style actions without a disclosure URL explain the manual check', () => {
    const c = hlb();
    const manual = {
      actionKey: 'check_holding_exposure',
      label: '외부 확인',
      description: '',
      actionType: 'external_hint',
      priority: 'secondary',
      dangerLevel: 'caution',
    } as const;
    expect(resolveRiskReviewActionPresentation(manual, c)).toMatchObject({
      href: null,
      label: '공시 확인 방법',
      afterClickExpectation: '공시 URL이 없어 확인 방법만 안내합니다.',
      isVerifiedDisclosure: false,
    });
  });

  it('uses disclosure label only for verified disclosure URLs', () => {
    const c = hlb();
    c.corporateActionRisk = {
      ...c.corporateActionRisk!,
      disclosureUrl: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=1',
    };
    const disc = buildRiskReviewActions(c).find((a) => a.actionKey === 'check_disclosure');
    expect(resolveRiskReviewActionPresentation(disc!, c)).toMatchObject({
      href: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=1',
      label: '공시 확인',
      isVerifiedDisclosure: true,
      afterClickExpectation: '외부 공시 페이지를 엽니다.',
    });
  });

  it('does not show disclosure label when a disclosure source ref has no URL', () => {
    const c = hlb();
    c.corporateActionRisk = {
      ...c.corporateActionRisk!,
      sourceRefs: [{ type: 'disclosure', label: 'manual registry without URL' }],
    };
    const disc = buildRiskReviewActions(c).find((a) => a.actionKey === 'check_disclosure');
    const presentation = resolveRiskReviewActionPresentation(disc!, c);
    expect(presentation.label).toBe('공시 확인 방법');
    expect(presentation.isVerifiedDisclosure).toBe(false);
    expect(presentation.href).toBeNull();
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
