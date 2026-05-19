import type { TodayCandidateRiskReviewAction } from '@office-unify/shared-types';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import {
  buildDisclosureResearchHrefFromCandidate,
  buildResearchCenterHrefFromCandidate,
} from '@/lib/todayCandidateNavigationLinks';

/** Risk review action → href (no DB write). */
export function resolveRiskReviewActionHref(
  action: TodayCandidateRiskReviewAction,
  candidate: TodayStockCandidate,
): string | null {
  if (action.href?.trim()) return action.href;
  if (action.actionKey === 'check_disclosure' || action.actionType === 'external_hint') {
    return buildDisclosureResearchHrefFromCandidate(candidate);
  }
  if (action.actionKey === 'generate_research_report' || action.actionKey === 'view_report_history') {
    return buildResearchCenterHrefFromCandidate(candidate, { riskReview: true });
  }
  return null;
}

export function riskReviewActionButtonLabel(action: TodayCandidateRiskReviewAction): string {
  if (action.actionKey === 'check_disclosure') return '공시 확인';
  if (action.actionType === 'external_hint') return action.label.includes('공시') ? '공시 확인' : '외부 확인';
  return action.label;
}

export function isRiskReviewNavigateAction(action: TodayCandidateRiskReviewAction): boolean {
  return action.actionType === 'navigate' || action.actionType === 'external_hint';
}

export function isRiskReviewFeedbackAction(action: TodayCandidateRiskReviewAction): boolean {
  return (
    action.actionType === 'api_post' &&
    (action.actionKey === 'mark_risk_reviewed' ||
      action.actionKey === 'hide_for_7d' ||
      action.actionKey === 'keep_observing')
  );
}

export function orderedRiskReviewActionsForUi(
  actions: TodayCandidateRiskReviewAction[] | undefined,
): TodayCandidateRiskReviewAction[] {
  if (!actions?.length) return [];
  const priority = { primary: 0, secondary: 1, tertiary: 2 };
  return [...actions].sort((a, b) => priority[a.priority] - priority[b.priority]);
}
