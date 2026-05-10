import type { ResearchDeskId } from '@office-unify/shared-types';

const DESK_ORDER: ResearchDeskId[] = [
  'goldman_buy',
  'blackrock_quality',
  'hindenburg_short',
  'citadel_tactical_short',
];

/**
 * When chief-editor Gemini fails, merge desk texts into a single degraded summary (analysis aid only).
 */
export function buildDeskSynthesisEditor(reports: Partial<Record<ResearchDeskId, string>>): string {
  const parts: string[] = [
    '## 종합 (Chief Editor 대체)',
    '',
    'Chief Editor 단계가 완료되지 않아 데스크별 초안을 자동 병합했습니다. 판단 보조용이며 확정적 투자 의견이 아닙니다.',
    '',
  ];
  for (const id of DESK_ORDER) {
    const t = reports[id]?.trim();
    if (!t) continue;
    parts.push(`### ${id}`, '', t, '');
  }
  return parts.join('\n').trim();
}
