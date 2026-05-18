import { describe, expect, it } from 'vitest';
import { attachActionStepsToDetail, buildActionStepsFromDetail, patchActionStepStatus } from '@/lib/actionSteps';
import { buildUsDiagnosticsActionItemDetail } from '@/lib/actionItemDetailBuilders';

describe('actionSteps', () => {
  it('converts checklist to actionSteps with recommended actions', () => {
    const detail = attachActionStepsToDetail(buildUsDiagnosticsActionItemDetail());
    expect((detail.actionSteps?.length ?? 0) > 0).toBe(true);
    const step = detail.actionSteps?.find((s) => s.label.includes('Google Sheets'));
    expect(step?.recommendedActions?.some((a) => a.actionKey === 'open_research')).toBe(true);
  });

  it('patches step status in detail_json shape', () => {
    const base = buildActionStepsFromDetail({
      checklist: [{ label: '공시 일정 확인' }],
    });
    const detail = { checklist: [{ label: '공시 일정 확인' }], actionSteps: base };
    const patched = patchActionStepStatus(detail, base[0]!.stepId, 'done');
    expect(patched.actionSteps?.[0]?.status).toBe('done');
  });
});
