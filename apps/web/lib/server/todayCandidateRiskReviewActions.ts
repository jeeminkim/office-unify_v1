import 'server-only';

import type { TodayCandidateRiskReviewAction, TodayCandidateUserFeedbackState } from '@office-unify/shared-types';
import { TODAY_CANDIDATE_FEEDBACK_API_ROUTE } from '@/lib/server/todayCandidateFeedbackStore';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import { attachPolicyKind } from '@/lib/todayCandidateActionPolicy';
import {
  buildPortfolioExposureHrefFromCandidate,
  buildResearchCenterHrefFromCandidate,
  buildTradeJournalSeedHrefFromCandidate,
  buildWatchlistFocusHrefFromCandidate,
} from '@/lib/todayCandidateNavigationLinks';

export type RiskReviewActionBuildContext = {
  isHolding?: boolean;
  isWatchlist?: boolean;
  hasReportHistory?: boolean;
  reportOlderThan7d?: boolean;
  reportFreshness?: string;
  userFeedback?: TodayCandidateUserFeedbackState;
};

function feedbackPayload(
  candidate: TodayStockCandidate,
  action: 'hide_7d' | 'mark_reviewed' | 'keep_observing',
) {
  const code = sym(candidate);
  return {
    route: TODAY_CANDIDATE_FEEDBACK_API_ROUTE,
    action,
    symbol: code || undefined,
    candidateId: candidate.candidateId,
  };
}

function appendFeedbackActions(
  actions: TodayCandidateRiskReviewAction[],
  candidate: TodayStockCandidate,
  ctx: RiskReviewActionBuildContext,
): void {
  const fb = ctx.userFeedback;

  const hideApplied = fb?.active && fb.action === 'hide_7d';
  const reviewedApplied = fb?.active && fb.action === 'mark_reviewed';
  const observingApplied = fb?.active && fb.action === 'keep_observing';

  actions.push(
    action({
      actionKey: 'mark_risk_reviewed',
      label: reviewedApplied ? '검토 완료됨' : '리스크 점검 완료',
      description: reviewedApplied
        ? '이미 리스크·확인사항을 점검 완료로 표시했습니다. 매수/매도 판단이 아닙니다.'
        : '이 후보의 리스크와 확인사항을 검토했다는 표시를 남깁니다. 매수/매도 판단이 아닙니다.',
      actionType: 'api_post',
      method: 'POST',
      priority: 'primary',
      dangerLevel: 'none',
      requiresConfirmation: true,
      writeAction: true,
      deferred: reviewedApplied,
      payloadHint: feedbackPayload(candidate, 'mark_reviewed'),
    }),
    action({
      actionKey: 'hide_for_7d',
      label: hideApplied ? '7일 낮은 우선순위 적용됨' : '7일간 낮은 우선순위로 보기',
      description: hideApplied
        ? '7일 동안 Today Candidate에서 낮은 우선순위로 표시 중입니다. 관심종목 삭제·매매 실행 없음.'
        : '이 후보를 삭제하지 않고 7일 동안 Today Candidate에서 낮은 우선순위로 둡니다.',
      actionType: 'api_post',
      method: 'POST',
      priority: 'secondary',
      dangerLevel: 'none',
      requiresConfirmation: true,
      writeAction: true,
      deferred: hideApplied,
      payloadHint: feedbackPayload(candidate, 'hide_7d'),
    }),
    action({
      actionKey: 'keep_observing',
      label: observingApplied ? '계속 관찰 중' : '계속 관찰',
      description: observingApplied
        ? '반복 노출 진단은 유지됩니다. 관심종목 자동 등록·매매 실행 없음.'
        : '반복 노출되더라도 당분간 계속 관찰하겠다는 표시를 남깁니다.',
      actionType: 'api_post',
      method: 'POST',
      priority: 'tertiary',
      dangerLevel: 'none',
      requiresConfirmation: true,
      writeAction: true,
      deferred: observingApplied,
      payloadHint: feedbackPayload(candidate, 'keep_observing'),
    }),
  );
}

export function isRiskReviewCandidate(c: TodayStockCandidate): boolean {
  if (c.briefDeckSlot === 'risk_review') return true;
  if (c.decisionTrace?.decisionStatus === 'risk_review') return true;
  if (c.corporateActionRisk?.active && c.candidateAction === 'review_required') return true;
  if (c.corporateActionRisk?.active && c.displayMetrics?.candidateCardKind === 'risk_review') return true;
  return false;
}

function sym(c: TodayStockCandidate): string {
  return (c.stockCode ?? c.symbol ?? '').trim();
}

function action(
  partial: TodayCandidateRiskReviewAction,
): TodayCandidateRiskReviewAction {
  return attachPolicyKind(partial);
}

/**
 * 리스크 점검 후보용 액션 계약만 생성한다. DB write·리포트 생성은 하지 않는다.
 */
export function buildRiskReviewActions(
  candidate: TodayStockCandidate,
  ctx: RiskReviewActionBuildContext = {},
): TodayCandidateRiskReviewAction[] {
  if (!isRiskReviewCandidate(candidate)) return [];

  const corpActive = candidate.corporateActionRisk?.active === true;
  const isHolding =
    ctx.isHolding ??
    Boolean(
      candidate.concentrationRiskAssessment &&
        candidate.concentrationRiskAssessment.level !== 'none' &&
        !candidate.concentrationRiskAssessment.reasonCodes?.includes('holdings_missing'),
    );
  const isWatchlist = ctx.isWatchlist ?? Boolean(candidate.alreadyInWatchlist || candidate.watchlistItemId);
  const hasReport = ctx.hasReportHistory === true;
  const reportOld = ctx.reportOlderThan7d === true;

  const actions: TodayCandidateRiskReviewAction[] = [];

  actions.push(
    action({
      actionKey: 'open_risk_detail',
      label: '리스크 상세 보기',
      description: '유상증자·주주배정 등 기업 이벤트 리스크와 확인할 항목을 펼쳐봅니다.',
      actionType: 'local_expand',
      priority: 'primary',
      dangerLevel: corpActive ? 'caution' : 'none',
    }),
    action({
      actionKey: 'create_decision_retrospective',
      label: '판단 복기로 남기기',
      description: '지금의 판단 근거와 확인할 조건을 복기 항목으로 저장합니다.',
      actionType: 'api_post',
      method: 'POST',
      payloadHint: { route: '/api/decision-retrospectives/from-today-candidate', candidateId: candidate.candidateId },
      priority: 'primary',
      dangerLevel: 'none',
      requiresConfirmation: true,
      writeAction: true,
    }),
    action({
      actionKey: 'create_trade_journal_seed',
      label: '관찰 메모로 남기기',
      description: '실제 매매 기록이 아니라 판단·복기 메모 초안으로 Trade Journal을 엽니다.',
      actionType: 'navigate',
      href: buildTradeJournalSeedHrefFromCandidate(candidate),
      priority: 'secondary',
      dangerLevel: 'none',
    }),
  );

  if (corpActive) {
    actions.push(
      action({
        actionKey: 'check_disclosure',
        label: '공시·기업 이벤트 확인',
        description: '권리락·신주배정 기준일·공시 일정을 먼저 확인하세요. (외부 공시 사이트에서 직접 확인)',
        actionType: 'external_hint',
        priority: 'primary',
        dangerLevel: 'caution',
      }),
    );

    if (hasReport) {
      actions.push(
        action({
          actionKey: 'view_report_history',
          label: reportOld ? '지난 리포트 이후 변화 확인' : '리서치 리포트 확인',
          description: reportOld
            ? '기존 리포트가 7일 이상 지났습니다. diff와 함께 변화를 먼저 확인하세요.'
            : '기존 리포트가 있으면 재사용하고, 필요할 때만 새로 생성하세요.',
          actionType: 'navigate',
          href: buildResearchCenterHrefFromCandidate(candidate, { riskReview: true }),
          priority: 'primary',
          dangerLevel: 'none',
          payloadHint: { reportFreshness: ctx.reportFreshness },
        }),
      );
    } else {
      actions.push(
        action({
          actionKey: 'generate_research_report',
          label: '리서치 리포트로 확인',
          description: '리포트가 없으면 Research Center에서 생성·확인합니다. 생성은 명시 버튼을 눌렀을 때만 진행됩니다.',
          actionType: 'navigate',
          href: buildResearchCenterHrefFromCandidate(candidate, { riskReview: true }),
          priority: 'primary',
          dangerLevel: 'none',
        }),
      );
    }

  } else {
    actions.push(
      action({
        actionKey: 'generate_research_report',
        label: '리서치 리포트로 확인',
        description: '추가 맥락이 필요하면 Research Center에서 리포트를 확인·생성하세요.',
        actionType: 'navigate',
        href: buildResearchCenterHrefFromCandidate(candidate, { riskReview: true }),
        priority: 'secondary',
        dangerLevel: 'none',
      }),
    );
  }

  if (isHolding) {
    actions.push(
      action({
        actionKey: 'check_holding_exposure',
        label: '보유 비중·노출 점검',
        description: '보유 중인 경우 평가·집중도·손실 허용 범위를 확인합니다. 자동 리밸런싱 없음.',
        actionType: 'navigate',
        href: buildPortfolioExposureHrefFromCandidate(candidate),
        priority: 'primary',
        dangerLevel: 'caution',
      }),
    );
  }

  if (isWatchlist) {
    actions.push(
      action({
        actionKey: 'update_watchlist_note',
        label: '관심종목 메모 보기',
        description: '관심종목 원장에서 메모·섹터 매칭 상태를 확인·수정합니다.',
        actionType: 'navigate',
        href: buildWatchlistFocusHrefFromCandidate(candidate),
        priority: 'secondary',
        dangerLevel: 'none',
      }),
    );
  }

  appendFeedbackActions(actions, candidate, ctx);

  const order = { primary: 0, secondary: 1, tertiary: 2 };
  return actions.sort((a, b) => order[a.priority] - order[b.priority]);
}

export function attachRiskReviewActionsToDeck(
  deck: TodayStockCandidate[],
  ctxByCandidateId?: Map<string, RiskReviewActionBuildContext>,
): TodayStockCandidate[] {
  return deck.map((c) => {
    if (!isRiskReviewCandidate(c)) return c;
    const ctx = {
      ...(ctxByCandidateId?.get(c.candidateId) ?? {}),
      userFeedback: c.userFeedbackState ?? ctxByCandidateId?.get(c.candidateId)?.userFeedback,
    };
    const riskReviewActions = buildRiskReviewActions(c, ctx);
    if (!riskReviewActions.length) return c;
    return { ...c, riskReviewActions };
  });
}

export async function buildRiskReviewContextBySymbol(params: {
  deck: TodayStockCandidate[];
  userKey: string;
  supabase: import('@supabase/supabase-js').SupabaseClient | null;
}): Promise<Map<string, RiskReviewActionBuildContext>> {
  const map = new Map<string, RiskReviewActionBuildContext>();
  const supabase = params.supabase;
  if (!supabase) return map;

  const riskCandidates = params.deck.filter(isRiskReviewCandidate);
  const { findLatestResearchReport, shouldReuseResearchReport } = await import(
    '@/lib/server/researchReportHistoryStore'
  );

  await Promise.all(
    riskCandidates.map(async (c) => {
      const code = sym(c);
      if (!code) return;
      const { row, tableMissing } = await findLatestResearchReport({
        supabase,
        userKey: params.userKey,
        symbol: code,
      });
      if (tableMissing) return;
      const reuse = shouldReuseResearchReport({ latest: row });
      const generatedAt = row?.generated_at ? new Date(row.generated_at) : null;
      const reportOlderThan7d =
        generatedAt != null
          ? Math.floor((Date.now() - generatedAt.getTime()) / (24 * 60 * 60 * 1000)) >= 7
          : false;
      map.set(c.candidateId, {
        isWatchlist: Boolean(c.alreadyInWatchlist),
        hasReportHistory: Boolean(row),
        reportOlderThan7d,
        reportFreshness: reuse.reason,
      });
    }),
  );

  return map;
}

/** 리스크 카드 기본 영역 한 줄 요약(중복 문구 제거용). */
export function buildRiskReviewPrimarySummary(c: TodayStockCandidate): string {
  const next =
    '다음 액션: 리포트 확인 · 판단 복기 · 관찰 메모';
  if (c.corporateActionRisk?.active) {
    return `기업 이벤트 리스크가 있어 신규 판단 전 확인이 필요합니다. ${next}.`;
  }
  return `리스크 점검이 필요한 후보입니다. ${next}.`;
}
