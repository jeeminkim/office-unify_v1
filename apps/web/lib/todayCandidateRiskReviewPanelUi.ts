import type { TodayCandidateRiskReviewAction } from '@office-unify/shared-types';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import {
  buildResearchCenterHrefFromCandidate,
} from '@/lib/todayCandidateNavigationLinks';

export type RiskReviewActionPresentation = {
  href: string | null;
  label: string;
  afterClickExpectation?: string;
  isVerifiedDisclosure: boolean;
};

const VERIFIED_DISCLOSURE_HOSTS = new Set(['dart.fss.or.kr', 'kind.krx.co.kr']);

function payloadMarksDisclosure(action: TodayCandidateRiskReviewAction): boolean {
  return action.payloadHint?.kind === 'disclosure' || action.payloadHint?.sourceType === 'disclosure';
}

function disclosureTarget(candidate: TodayStockCandidate): { href: string | null; verifiedByRef: boolean } {
  const corp = candidate.corporateActionRisk;
  const direct = corp?.disclosureUrl?.trim() || corp?.filingUrl?.trim();
  if (direct) return { href: direct, verifiedByRef: true };

  const ref = corp?.sourceRefs?.find(
    (item) =>
      item.type === 'disclosure' ||
      item.sourceType === 'disclosure' ||
      item.kind === 'disclosure',
  );
  return {
    href: ref?.href?.trim() || ref?.url?.trim() || null,
    verifiedByRef: Boolean(ref),
  };
}

export function isVerifiedDisclosureHref(
  href: string | null | undefined,
  action?: TodayCandidateRiskReviewAction,
): boolean {
  if (!href?.trim()) return false;
  if (action && payloadMarksDisclosure(action)) return true;
  try {
    const url = new URL(href, 'https://office-unify.local');
    return VERIFIED_DISCLOSURE_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Resolve a risk-review target only. This helper never writes. */
export function resolveRiskReviewActionHref(
  action: TodayCandidateRiskReviewAction,
  candidate: TodayStockCandidate,
): string | null {
  if (action.href?.trim()) return action.href;
  if (action.actionKey === 'check_disclosure') {
    return null;
  }
  if (action.actionType === 'external_hint') {
    return null;
  }
  if (action.actionKey === 'generate_research_report' || action.actionKey === 'view_report_history') {
    return buildResearchCenterHrefFromCandidate(candidate, { riskReview: true });
  }
  return null;
}

export function resolveRiskReviewActionPresentation(
  action: TodayCandidateRiskReviewAction,
  candidate: TodayStockCandidate,
): RiskReviewActionPresentation {
  const candidateDisclosure = disclosureTarget(candidate);
  const directDisclosureHref = candidateDisclosure.href ?? action.href?.trim() ?? null;
  if (
    action.actionKey === 'check_disclosure' &&
    directDisclosureHref &&
    (candidateDisclosure.verifiedByRef || isVerifiedDisclosureHref(directDisclosureHref, action))
  ) {
    return {
      href: directDisclosureHref,
      label: '공시 확인',
      afterClickExpectation: '외부 공시 페이지를 엽니다.',
      isVerifiedDisclosure: true,
    };
  }

  const href = resolveRiskReviewActionHref(action, candidate);
  if (action.actionKey === 'check_disclosure') {
    return {
      href,
      label: href?.includes('/research-center') ? '리스크 리서치' : '공시 확인 방법',
      afterClickExpectation: href?.includes('/research-center')
        ? '리서치 화면으로 이동합니다. 공시 원문을 직접 여는 버튼이 아닙니다.'
        : '공시 URL이 없어 확인 방법만 안내합니다.',
      isVerifiedDisclosure: false,
    };
  }
  if (action.actionType === 'external_hint' && !isVerifiedDisclosureHref(href, action)) {
    return {
      href,
      label: '공시 확인 방법',
      afterClickExpectation: '공시 URL이 없어 확인 방법만 안내합니다.',
      isVerifiedDisclosure: false,
    };
  }
  return {
    href,
    label: action.label,
    isVerifiedDisclosure: isVerifiedDisclosureHref(href, action),
  };
}

export function riskReviewActionButtonLabel(
  action: TodayCandidateRiskReviewAction,
  candidate?: TodayStockCandidate,
): string {
  if (candidate) return resolveRiskReviewActionPresentation(action, candidate).label;
  if (action.actionKey === 'check_disclosure') return '공시 확인 방법';
  if (action.actionType === 'external_hint') return '외부 자료 확인';
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
