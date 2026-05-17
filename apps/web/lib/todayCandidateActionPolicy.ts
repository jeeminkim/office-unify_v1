/**
 * Today Candidate 리스크 점검 액션 계약 — UI는 생성된 액션만 렌더링한다.
 * 액션 목록 생성만으로 DB write·리포트 생성은 수행하지 않는다.
 */

import type { TodayCandidateRiskReviewAction } from '@office-unify/shared-types';

/** 사용자 액션 정책 분류(UI·테스트용, additive). */
export type TodayCandidateActionPolicyKind =
  | 'local_expand'
  | 'navigate'
  | 'api_post_confirmed'
  | 'disabled_todo';

export type TodayCandidateRiskReviewActionWithPolicy = TodayCandidateRiskReviewAction & {
  policyKind: TodayCandidateActionPolicyKind;
};

/** 리스크 점검 후보에 기대되는 필수 액션 키(일부는 컨텍스트에 따라 생략 가능). */
export const RISK_REVIEW_CORE_ACTION_KEYS = [
  'open_risk_detail',
  'generate_research_report',
  'view_report_history',
  'create_decision_retrospective',
  'create_trade_journal_seed',
  'keep_observing',
] as const;

export function resolveActionPolicyKind(
  action: Pick<
    TodayCandidateRiskReviewAction,
    'actionType' | 'writeAction' | 'deferred' | 'requiresConfirmation'
  >,
): TodayCandidateActionPolicyKind {
  if (action.deferred) return 'disabled_todo';
  if (action.actionType === 'local_expand' || action.actionType === 'copy_hint') {
    return 'local_expand';
  }
  if (action.actionType === 'navigate' || action.actionType === 'external_hint') {
    return 'navigate';
  }
  if (action.actionType === 'api_post') {
    if (action.writeAction && action.requiresConfirmation && !action.deferred) {
      return 'api_post_confirmed';
    }
    if (action.deferred) return 'disabled_todo';
    return 'api_post_confirmed';
  }
  return 'navigate';
}

export function attachPolicyKind(
  action: TodayCandidateRiskReviewAction,
): TodayCandidateRiskReviewActionWithPolicy {
  return { ...action, policyKind: resolveActionPolicyKind(action) };
}

/** corporateActionRisk active 후보에 기대되는 액션 라벨(테스트·문서용). */
export function expectedCorporateRiskActionLabels(): string[] {
  return [
    '리스크 상세 보기',
    '판단 복기로 남기기',
    '관찰 메모로 남기기',
    '리서치 리포트',
    '공시·기업 이벤트 확인',
    '리스크 점검 완료',
    '계속 관찰',
  ];
}

export function assertNoWriteOnActionBuild(actions: TodayCandidateRiskReviewAction[]): void {
  for (const a of actions) {
    if (a.writeAction && !a.requiresConfirmation && !a.deferred) {
      throw new Error(`writeAction without confirmation: ${a.actionKey}`);
    }
  }
}
