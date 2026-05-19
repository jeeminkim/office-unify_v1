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
  keyReasons: ['섹터 집중'],
  riskFlags: ['변동성'],
  opportunityDrivers: [],
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

  it('prefers structured summary over raw JSON', () => {
    const { readable, rawForDebug } = resolveLineDisplayContent({
      slug: 'hindenburg',
      displayName: 'H',
      content: '{"displaySummary":"hidden"}',
      structuredOutput: sampleStructured,
    });
    expect(readable).toContain('요약 본문');
    expect(buildReadableSummaryFromStructured(sampleStructured)).toContain('핵심 근거');
    expect(rawForDebug).toBeTruthy();
  });
});
