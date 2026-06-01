import { describe, expect, it } from 'vitest';
import {
  contentLooksLikeRawJson,
  resolveLineDisplayContent,
  buildReadableSummaryFromStructured,
} from '@/lib/committeeStructuredDisplay';
import type { PersonaStructuredOutput } from '@office-unify/shared-types';

const sampleStructured: PersonaStructuredOutput = {
  role: 'risk',
  stance: 'review',
  confidence: 'medium',
  keyReasons: ['데이터 집중'],
  riskFlags: ['변동성'],
  opportunityDrivers: ['수주가 확인되면 관찰 가치가 생김'],
  missingEvidence: ['수급'],
  contradictions: [],
  doNotDo: ['추격 매수'],
  nextChecks: ['비중 확인'],
  displaySummary: '요약 본문',
};

describe('committeeStructuredDisplay', () => {
  it('detects raw JSON content', () => {
    expect(contentLooksLikeRawJson('{"displaySummary":"x","keyReasons":[]}')).toBe(true);
  });

  it('prefers six-section structured report over raw JSON', () => {
    const { readable, rawForDebug } = resolveLineDisplayContent({
      slug: 'hindenburg',
      displayName: 'H',
      content: '{"displaySummary":"hidden"}',
      structuredOutput: sampleStructured,
    });
    expect(readable).toContain('요약 본문');
    const card = buildReadableSummaryFromStructured(sampleStructured);
    for (const label of ['[결론]', '[기회 요인]', '[리스크 요인]', '[조건부 관찰 기준]', '[지금 확인할 것]', '[하지 말 것]']) {
      expect(card).toContain(label);
    }
    expect(rawForDebug).toBeTruthy();
  });

  it('keeps raw JSON out of the primary body when structured output is missing', () => {
    const { readable, rawForDebug } = resolveLineDisplayContent({
      slug: 'hindenburg',
      displayName: 'H',
      content: '{"displaySummary":"hidden","keyReasons":["raw"]',
    });
    expect(readable).toContain('핵심 요약만 표시');
    expect(readable).not.toContain('"keyReasons"');
    expect(rawForDebug).toContain('"keyReasons"');
  });

  it('humanizes snake_case artifacts in the primary body', () => {
    const readable = buildReadableSummaryFromStructured({
      ...sampleStructured,
      keyReasons: ['hindsight_bias', 'systematic_model_enhancement'],
      riskFlags: ['lack_of_predefined_exit_criteria'],
      nextChecks: ['custom_internal_signal'],
    });
    expect(readable).toContain('결과를 보고 과거 판단을 과도하게 후회할 위험');
    expect(readable).toContain('판단 기준을 더 체계화할 필요');
    expect(readable).toContain('사전에 정한 종료 기준 부족');
    expect(readable).toContain('추가 확인 필요: custom internal signal');
    expect(readable).not.toContain('hindsight_bias');
  });
});
