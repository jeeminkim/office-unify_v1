import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import { TodayCandidateRiskReviewPanel } from './TodayCandidateRiskReviewPanel';

function riskCandidate(): TodayStockCandidate {
  return {
    candidateId: 'risk-mobile-truth',
    name: 'HLB',
    market: 'KOSDAQ',
    country: 'KR',
    stockCode: '028300',
    source: 'watchlist',
    score: 48,
    confidence: 'medium',
    riskLevel: 'high',
    reasonSummary: '공시와 이벤트를 먼저 확인해야 합니다.',
    reasonDetails: [],
    positiveSignals: [],
    cautionNotes: [],
    relatedUserContext: [],
    relatedWatchlistSymbols: [],
    isBuyRecommendation: false,
    candidateAction: 'review_required',
    briefDeckSlot: 'risk_review',
    corporateActionRisk: {
      active: true,
      riskType: 'rights_offering',
      headline: '권리 일정 확인 필요',
      sourceLabel: 'registry',
      effectiveFrom: '2026-05-23',
      expiresAt: null,
    },
    riskReviewActions: [
      {
        actionKey: 'open_risk_detail',
        label: '리스크 상세',
        description: '',
        actionType: 'local_expand',
        priority: 'primary',
        dangerLevel: 'caution',
      },
      {
        actionKey: 'check_disclosure',
        label: '공시 확인',
        description: '',
        actionType: 'external_hint',
        priority: 'primary',
        dangerLevel: 'caution',
      },
      {
        actionKey: 'create_trade_journal_seed',
        label: '관찰 메모',
        description: '',
        actionType: 'navigate',
        href: '/trade-journal?seed=1',
        priority: 'secondary',
        dangerLevel: 'none',
      },
    ],
  };
}

describe('TodayCandidateRiskReviewPanel mobile trust surface', () => {
  it('renders mobile primary actions with truthful manual disclosure labeling and More grouping', () => {
    const html = renderToStaticMarkup(
      <TodayCandidateRiskReviewPanel
        candidate={riskCandidate()}
        panelOpen={false}
        onTogglePanel={() => undefined}
      />,
    );

    expect(html).toContain('리스크 점검하기');
    expect(html).toContain('공시 확인 방법');
    expect(html).not.toContain('공시 확인</a>');
    expect(html).not.toContain('리스크 리서치');
    expect(html).toContain('관찰 메모');
    expect(html).toContain('더보기');
    expect(html).toContain('공시 URL이 없어 확인 방법만 안내합니다');
  });

  it('renders reviewed feedback as monitoring state', () => {
    const candidate = riskCandidate();
    candidate.userFeedbackState = {
      action: 'mark_reviewed',
      active: true,
      createdAt: '2026-05-23T00:00:00.000Z',
      reviewedAt: '2026-05-23T00:00:00.000Z',
    };

    const html = renderToStaticMarkup(
      <TodayCandidateRiskReviewPanel
        candidate={candidate}
        panelOpen={false}
        onTogglePanel={() => undefined}
      />,
    );

    expect(html).toContain('점검 완료 · 관찰 모니터링');
  });
});
