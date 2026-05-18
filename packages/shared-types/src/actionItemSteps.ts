/** Action Item 실행 단계 — checklist를 순차 실행 가능한 step으로 분해 (additive). */

export type ActionItemStepCategory =
  | 'check_now'
  | 'do_not_do'
  | 'evidence'
  | 'research'
  | 'retrospective'
  | 'portfolio'
  | 'ops'
  | 'manual';

export type ActionItemStepActionKey =
  | 'open_research'
  | 'ask_pb'
  | 'open_committee'
  | 'open_journal'
  | 'open_retrospective'
  | 'copy_step'
  | 'mark_done'
  | 'refresh_quotes'
  | 'open_portfolio';

export type ActionItemStepRecommendedAction = {
  actionKey: ActionItemStepActionKey;
  label: string;
  href?: string;
  requiresWrite?: boolean;
};

export type ActionItemStep = {
  stepId: string;
  label: string;
  reason?: string;
  category: ActionItemStepCategory;
  status?: 'open' | 'selected' | 'done' | 'dismissed';
  recommendedActions?: ActionItemStepRecommendedAction[];
  sourceRefs?: Array<{ sourceType: string; sourceId?: string }>;
};
