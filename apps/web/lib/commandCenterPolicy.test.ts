import { describe, expect, it } from 'vitest';
import { buildCommandCenterPlan, pickTopOpenActionItems } from '@/lib/commandCenterPolicy';

describe('commandCenterPolicy', () => {
  it('shows data blocker first when SQL hints present', () => {
    const plan = buildCommandCenterPlan({
      statusSections: [],
      weeklySqlReadiness: { actionHints: ['web_action_items table missing'] },
      todayBrief: null,
      openActionItems: [],
      opsOpenErrorCount: null,
    });
    expect(plan.dataBlocker?.type).toBe('data_blocker');
    expect(plan.dataBlocker?.href).toBe('/ops/sql-readiness');
    expect(plan.dataBlocker?.actionIntent).toBe('read_only_check');
    expect(plan.dataBlocker?.afterClickExpectation).toBeTruthy();
  });

  it('includes open action items in today list', () => {
    const plan = buildCommandCenterPlan({
      statusSections: [],
      weeklySqlReadiness: null,
      todayBrief: null,
      openActionItems: [
        {
          id: 'a1',
          title: '[리스크] 테스트',
          priority: 'high',
          source_type: 'today_candidate',
          updated_at: new Date(Date.now() - 10 * 86400000).toISOString(),
          status: 'open',
        },
      ],
      opsOpenErrorCount: null,
    });
    expect(plan.todayItems.some((i) => i.type === 'risk_review' || i.type === 'action_item')).toBe(true);
  });

  it('empty when no blockers and no items', () => {
    const plan = buildCommandCenterPlan({
      statusSections: [{ key: 'ok', title: 'OK', status: 'ok', message: 'fine' }],
      weeklySqlReadiness: null,
      todayBrief: { primaryCandidateDeck: [] },
      openActionItems: [],
      opsOpenErrorCount: null,
    });
    expect(plan.dataBlocker).toBeNull();
    expect(plan.todayItems.length).toBeLessThanOrEqual(3);
  });

  it('surfaces repeated personalization patterns as a warning action', () => {
    const plan = buildCommandCenterPlan({
      statusSections: [],
      weeklySqlReadiness: null,
      todayBrief: {
        primaryCandidateDeck: [],
        qualityMeta: {
          todayCandidates: {
            personalization: {
              repeatedPatternsCount: 2,
              hint: '최근 추격 확인 패턴이 반복되었습니다.',
            },
          },
        },
      },
      openActionItems: [],
      opsOpenErrorCount: null,
    });
    expect(plan.todayItems.some((i) => i.type === 'committee_recovery' && i.severity === 'warning')).toBe(true);
    expect(plan.todayItems.find((i) => i.type === 'committee_recovery')?.actionIntent).toBe('navigate_only');
    expect(plan.personalization?.repeatedPatternCount).toBe(2);
  });

  it('does not promote already reviewed risk cards as next actions', () => {
    const plan = buildCommandCenterPlan({
      statusSections: [],
      weeklySqlReadiness: null,
      todayBrief: {
        primaryCandidateDeck: [
          {
            name: 'HLB',
            stockCode: '028300',
            candidateAction: 'review_required',
            briefDeckSlot: 'risk_review',
            reasonSummary: 'risk review',
            userFeedbackState: { action: 'mark_reviewed', active: true, createdAt: '2026-05-19', reviewedAt: '2026-05-19' },
          },
        ],
      },
      openActionItems: [],
      opsOpenErrorCount: null,
    });

    expect(plan.todayItems.some((i) => i.type === 'risk_review')).toBe(false);
  });

  it('orders open action items and marks weak detail for dashboard summary', () => {
    const items = pickTopOpenActionItems(
      [
        {
          id: 'low',
          title: '낮은 우선순위',
          priority: 'low',
          source_type: 'manual',
          updated_at: new Date().toISOString(),
          status: 'open',
        },
        {
          id: 'high',
          title: '높은 우선순위',
          priority: 'high',
          source_type: 'research_report',
          source_label: 'Research',
          updated_at: new Date(Date.now() - 86400000).toISOString(),
          status: 'open',
        },
      ],
      2,
    );
    expect(items[0]?.id).toBe('high');
    expect(items[0]?.sourceDisplay).toBeTruthy();
    expect(items.some((i) => i.weakDetail)).toBe(true);
  });

  it('wording avoids auto-trading', () => {
    const plan = buildCommandCenterPlan({
      statusSections: [],
      weeklySqlReadiness: { actionHints: ['missing'] },
      todayBrief: null,
      openActionItems: [],
      opsOpenErrorCount: null,
    });
    const blob = JSON.stringify(plan);
    expect(blob).not.toMatch(/자동매매|자동 주문|자동 리밸런싱|매수 추천/);
  });
});
