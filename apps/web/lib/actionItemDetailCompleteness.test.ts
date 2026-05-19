import { describe, expect, it } from 'vitest';
import {
  analyzeActionItemDetailCompleteness,
  detailContainsBannedTradeInstruction,
} from '@/lib/actionItemDetailCompleteness';
import { enrichCreateRequestWithDetail } from '@/lib/actionItemDetailBuilders';
import type { ActionItemDetailJson } from '@office-unify/shared-types';

describe('actionItemDetailCompleteness', () => {
  it('weak detail scores low with missingFields', () => {
    const report = analyzeActionItemDetailCompleteness({ notTradeInstruction: true });
    expect(report.level).toBe('minimal');
    expect(report.missingFields.length).toBeGreaterThan(2);
    expect(report.score).toBeLessThan(50);
  });

  it('enriched minimal create request reaches partial or full', () => {
    const enriched = enrichCreateRequestWithDetail({
      title: '테스트 확인 항목',
      sourceType: 'manual',
    });
    const report = analyzeActionItemDetailCompleteness(enriched.detailJson as ActionItemDetailJson);
    expect(report.hasSourceSummary).toBe(true);
    expect(report.hasChecklist).toBe(true);
    expect(report.hasDoNotDo).toBe(true);
    expect(report.hasNotTradeInstruction).toBe(true);
    expect(['partial', 'full']).toContain(report.level);
  });

  it('blocks banned trade instruction phrases in detail blob', () => {
    expect(
      detailContainsBannedTradeInstruction({
        whyCreated: '즉시 매수 추천',
        notTradeInstruction: true,
      }),
    ).toBe(true);
  });

  it('flags oversized raw text', () => {
    const huge = 'x'.repeat(5000);
    const report = analyzeActionItemDetailCompleteness({
      notTradeInstruction: true,
      sourceSummary: huge,
      whyCreated: 'ok',
      checklist: [{ label: 'a' }],
      doNotDo: ['매수·매도·자동 주문 없음'],
      sourceRefs: [{ sourceType: 'manual' }],
      actionSteps: [{ stepId: 's1', label: 'step', category: 'check_now', status: 'open' }],
    });
    expect(report.hasNoOversizedRawText).toBe(false);
    expect(report.missingFields).toContain('oversizedRawText');
  });
});
