import type { UsCandidateSetupDiagnosis } from '@office-unify/shared-types';

export function formatUsSetupGuideCopy(diagnosis: UsCandidateSetupDiagnosis, anchorLabel?: string): string {
  const g = diagnosis.googleFinanceGuide;
  return [
    '[미국 시장 데이터 설정 점검]',
    anchorLabel ? `Anchor: ${anchorLabel}` : null,
    `원인 추정: ${diagnosis.likelyRootCause}`,
    diagnosis.actionHint,
    '',
    '필요 tab: ' + g.requiredTabs.join(', '),
    '샘플 ticker: ' + g.sampleTickers.join(', '),
    '샘플 수식:',
    ...g.sampleFormulas.map((f) => `  ${f}`),
    'fallback: ' + g.fallbackTickers.join(', '),
    '',
    '점검 순서:',
    ...diagnosis.setupChecklist.map((c, i) => `${i + 1}. ${c.label} — ${c.howToCheck}`),
    '',
    '— 매수/매도·자동 주문 지시가 아닙니다.',
  ]
    .filter(Boolean)
    .join('\n');
}
