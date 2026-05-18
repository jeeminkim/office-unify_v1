import { describe, expect, it } from 'vitest';
import {
  buildActionItemDetailFromTodayCandidate,
  buildCommitteeRoadmapItemDetail,
  buildGenericActionItemDetail,
  buildUsDiagnosticsActionItemDetail,
} from '@/lib/actionItemDetailBuilders';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';

const baseCandidate = {
  candidateId: 'c1',
  name: 'HLB',
  stockCode: '028300',
  market: 'KR',
  reasonSummary: '기업 이벤트 리스크 점검',
  briefDeckSlot: 'risk_review',
  decisionTrace: {
    riskFlags: [{ code: 'corporate_action' }],
    nextChecks: ['공시 확인'],
    doNotDo: ['확대 금지'],
    missingEvidence: [{ code: 'disclosure' }],
  },
} as TodayStockCandidate;

describe('actionItemDetailBuilders', () => {
  it('today candidate risk review has checklist and notTradeInstruction', () => {
    const d = buildActionItemDetailFromTodayCandidate(baseCandidate);
    expect(d.notTradeInstruction).toBe(true);
    expect((d.checklist?.length ?? 0)).toBeGreaterThan(0);
    expect(d.doNotDo?.some((x) => x.includes('확대'))).toBe(true);
  });

  it('blocks trade instruction phrases in generic builder defaults', () => {
    const d = buildGenericActionItemDetail({
      sourceType: 'manual',
      title: '점검',
      doNotDo: ['매수·매도·자동 주문 지시가 아닙니다.'],
    });
    expect(d.notTradeInstruction).toBe(true);
    expect(d.checklist?.length).toBeGreaterThan(0);
  });

  it('committee roadmap maps buckets', () => {
    const d = buildCommitteeRoadmapItemDetail({
      title: '주간 점검',
      reason: '이유',
      bucket: 'doThisWeek',
    });
    expect(d.checklist?.[0]?.label).toContain('주간');
  });

  it('us diagnostics has anchor checklist', () => {
    const d = buildUsDiagnosticsActionItemDetail();
    expect(d.checklist?.some((c) => c.label.includes('SPY'))).toBe(true);
    expect(d.doNotDo?.some((x) => x.includes('empty'))).toBe(true);
  });
});
