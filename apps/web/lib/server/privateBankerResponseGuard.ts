import type { PbWeeklyReviewQualityMeta, PbWeeklyReviewResponseGuardMeta } from '@office-unify/shared-types';

const REQUIRED_SECTION_MARKERS = [
  '[행동 분류]',
  '[정보 상태]',
  '[사용자 적합성 점검]',
  '[보유 집중도 점검]',
  '[지금 해야 할 행동]',
  '[하면 안 되는 행동]',
  '[관찰해야 할 신호]',
] as const;

/**
 * PB 주간 점검 등 — 필수 섹션 헤더와 정책 문구(1차: 경고만).
 */
export function auditPrivateBankerStructuredResponse(text: string): PbWeeklyReviewResponseGuardMeta {
  const missingSections: string[] = [];
  for (const m of REQUIRED_SECTION_MARKERS) {
    if (!text.includes(m)) missingSections.push(m);
  }

  const policyPhraseWarnings: string[] = [];
  const t = text;
  if (!t.includes('자동 주문') && !t.includes('자동주문')) {
    policyPhraseWarnings.push('missing_auto_order_disclaimer');
  }
  if (!t.includes('자동 매매') && !t.includes('자동매매')) {
    policyPhraseWarnings.push('missing_auto_trading_disclaimer');
  }
  if (!t.includes('리밸런싱')) {
    policyPhraseWarnings.push('missing_rebalancing_disclaimer');
  }

  return {
    missingSections,
    ...(policyPhraseWarnings.length ? { policyPhraseWarnings } : {}),
  };
}

export function mergePbWeeklyReviewQualityMetaWithGuard(
  base: PbWeeklyReviewQualityMeta,
  guard: PbWeeklyReviewResponseGuardMeta,
): PbWeeklyReviewQualityMeta {
  return {
    ...base,
    privateBanker: {
      responseGuard: {
        missingSections: guard.missingSections,
        ...(guard.policyPhraseWarnings?.length ? { policyPhraseWarnings: guard.policyPhraseWarnings } : {}),
      },
    },
  };
}
