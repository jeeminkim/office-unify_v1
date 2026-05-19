import { describe, expect, it } from 'vitest';
import { buildCommandCenterPlan } from '@/lib/commandCenterPolicy';

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
