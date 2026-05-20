import 'server-only';

import type {
  TodayCandidateFeedbackAction,
  TodayCandidateFeedbackRequest,
  TodayCandidateFeedbackResponse,
  TodayCandidateFeedbackSourceRoute,
  TodayCandidateFeedbackSummary,
  TodayCandidateUserFeedbackState,
} from '@office-unify/shared-types';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';
import type { CandidateDecisionTrace, CandidateTraceReason } from '@office-unify/shared-types';
import { clampObservationScore, mergeScoreBreakdownIntoCandidate } from '@/lib/server/todayCandidateScoring';
import { traceReason } from '@/lib/server/todayCandidateDecisionTrace';

const TABLE = 'today_candidate_feedback';
const FEEDBACK_ROUTE = '/api/dashboard/today-candidates/feedback';
const MAX_REASON_LEN = 400;

const HIDE_7D_PENALTY = 22;
const KEEP_OBSERVING_REPEAT_RELIEF = 5;

export type TodayCandidateFeedbackRow = {
  id: string;
  user_key: string;
  candidate_id: string | null;
  symbol: string | null;
  feedback_action: TodayCandidateFeedbackAction;
  effective_from: string;
  effective_until: string | null;
  idempotency_key: string | null;
  created_at: string;
};

export function isTodayCandidateFeedbackTableMissingError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = String(err.message ?? '').toLowerCase();
  const code = String(err.code ?? '');
  if (code === '42P01') return true;
  if (msg.includes('today_candidate_feedback') && (msg.includes('does not exist') || msg.includes('schema cache'))) {
    return true;
  }
  if (msg.includes('does not exist') && msg.includes('relation')) return true;
  return false;
}

export function feedbackTableMissingActionHint(): string {
  return 'Supabase SQL Editor에서 docs/sql/append_today_candidate_feedback.sql을 적용한 뒤 다시 시도하세요. (docs/sql/APPLY_ORDER.md §8 순서 21)';
}

function ymdUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function buildTodayCandidateFeedbackIdempotencyKey(params: {
  userKey: string;
  action: TodayCandidateFeedbackAction;
  symbolOrCandidateId: string;
  ymd?: string;
}): string {
  const day = params.ymd ?? ymdUtc();
  const slug = params.symbolOrCandidateId.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 64);
  return `today-candidate-feedback:${params.userKey}:${params.action}:${slug}:${day}`;
}

function effectiveUntilForAction(action: TodayCandidateFeedbackAction, now: Date): string | null {
  if (action === 'hide_7d') {
    const until = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return until.toISOString();
  }
  return null;
}

function sanitizeSourceContext(
  ctx: TodayCandidateFeedbackRequest['sourceContext'] | undefined,
): Record<string, unknown> {
  if (!ctx) return {};
  const out: Record<string, unknown> = {};
  if (ctx.candidateAction) out.candidateAction = String(ctx.candidateAction).slice(0, 64);
  if (ctx.decisionStatus) out.decisionStatus = String(ctx.decisionStatus).slice(0, 64);
  if (ctx.judgmentQualityLevel) out.judgmentQualityLevel = String(ctx.judgmentQualityLevel).slice(0, 32);
  if (typeof ctx.score === 'number' && Number.isFinite(ctx.score)) {
    out.score = Math.max(0, Math.min(100, Math.round(ctx.score)));
  }
  if (Array.isArray(ctx.riskFlags)) {
    out.riskFlags = ctx.riskFlags.map((c) => String(c).slice(0, 48)).slice(0, 12);
  }
  return out;
}

function rowToUserState(row: TodayCandidateFeedbackRow, now = Date.now()): TodayCandidateUserFeedbackState {
  const until = row.effective_until ? new Date(row.effective_until).getTime() : null;
  const active = until == null || until > now;
  return {
    action: row.feedback_action,
    createdAt: row.created_at,
    reviewedAt: row.feedback_action === 'mark_reviewed' ? row.created_at : undefined,
    effectiveUntil: row.effective_until ?? undefined,
    active,
    feedbackId: row.id,
  };
}

function candidateLookupKeys(c: TodayStockCandidate): string[] {
  const keys: string[] = [];
  if (c.candidateId) keys.push(`id:${c.candidateId}`);
  const sym = (c.stockCode ?? c.symbol ?? '').trim();
  if (sym) keys.push(`sym:${sym.toUpperCase()}`);
  return keys;
}

/** 활성 피드백을 symbol/candidateId 키로 맵핑(최신 행 우선). */
export function indexActiveFeedbackByCandidateKey(
  rows: TodayCandidateFeedbackRow[],
): Map<string, TodayCandidateUserFeedbackState> {
  const now = Date.now();
  const map = new Map<string, TodayCandidateUserFeedbackState>();
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const row of sorted) {
    const state = rowToUserState(row, now);
    if (!state.active) continue;
    if (row.candidate_id) {
      const k = `id:${row.candidate_id}`;
      if (!map.has(k)) map.set(k, state);
    }
    if (row.symbol) {
      const k = `sym:${row.symbol.trim().toUpperCase()}`;
      if (!map.has(k)) map.set(k, state);
    }
  }
  return map;
}

export function resolveCandidateFeedbackState(
  c: TodayStockCandidate,
  byKey: Map<string, TodayCandidateUserFeedbackState>,
): TodayCandidateUserFeedbackState | undefined {
  for (const k of candidateLookupKeys(c)) {
    const hit = byKey.get(k);
    if (hit) return hit;
  }
  return undefined;
}

export async function fetchActiveTodayCandidateFeedback(params: {
  supabase: import('@supabase/supabase-js').SupabaseClient;
  userKey: string;
  symbols?: string[];
  candidateIds?: string[];
}): Promise<{ rows: TodayCandidateFeedbackRow[]; tableMissing: boolean }> {
  try {
    const { data, error } = await params.supabase
      .from(TABLE)
      .select('id,user_key,candidate_id,symbol,feedback_action,effective_from,effective_until,idempotency_key,created_at')
      .eq('user_key', params.userKey)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      if (isTodayCandidateFeedbackTableMissingError(error)) {
        return { rows: [], tableMissing: true };
      }
      return { rows: [], tableMissing: false };
    }

    const now = Date.now();
    const rows = ((data ?? []) as TodayCandidateFeedbackRow[]).filter((r) => {
      if (!r.effective_until) return true;
      return new Date(r.effective_until).getTime() > now;
    });
    return { rows, tableMissing: false };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isTodayCandidateFeedbackTableMissingError({ message: msg })) {
      return { rows: [], tableMissing: true };
    }
    return { rows: [], tableMissing: false };
  }
}

export async function saveTodayCandidateFeedback(params: {
  supabase: import('@supabase/supabase-js').SupabaseClient;
  userKey: string;
  body: TodayCandidateFeedbackRequest;
}): Promise<TodayCandidateFeedbackResponse> {
  const { body, userKey, supabase } = params;
  const action = body.action;
  if (!['hide_7d', 'mark_reviewed', 'keep_observing'].includes(action)) {
    return {
      ok: false,
      action,
      status: 'invalid_request',
      actionHint: 'action은 hide_7d, mark_reviewed, keep_observing 중 하나여야 합니다.',
    };
  }

  const symbol = (body.symbol ?? '').trim();
  const candidateId = (body.candidateId ?? '').trim();
  if (!symbol && !candidateId) {
    return {
      ok: false,
      action,
      status: 'invalid_request',
      actionHint: 'symbol 또는 candidateId가 필요합니다.',
    };
  }

  const slug = candidateId || symbol;
  const idempotencyKey =
    body.idempotencyKey?.trim() ||
    buildTodayCandidateFeedbackIdempotencyKey({ userKey, action, symbolOrCandidateId: slug });

  const now = new Date();
  const effectiveUntil = effectiveUntilForAction(action, now);
  const sourceRoute: TodayCandidateFeedbackSourceRoute = body.sourceRoute ?? 'dashboard';

  const insertRow = {
    user_key: userKey,
    request_id: body.requestId?.slice(0, 128) ?? null,
    candidate_id: candidateId || null,
    symbol: symbol || null,
    name: body.name?.slice(0, 120) ?? null,
    market: body.market?.slice(0, 16) ?? null,
    feedback_action: action,
    feedback_reason: body.reason?.trim().slice(0, MAX_REASON_LEN) ?? null,
    source_route: sourceRoute,
    source_context: sanitizeSourceContext(body.sourceContext),
    effective_from: now.toISOString(),
    effective_until: effectiveUntil,
    idempotency_key: idempotencyKey,
    updated_at: now.toISOString(),
  };

  const { data, error } = await supabase.from(TABLE).insert(insertRow).select('id,effective_until').maybeSingle();

  if (error) {
    if (isTodayCandidateFeedbackTableMissingError(error)) {
      return {
        ok: false,
        action,
        status: 'table_missing',
        actionHint: feedbackTableMissingActionHint(),
        idempotencyKey,
        qualityMeta: { writeAction: true, userConfirmedRequired: true, idempotent: true },
      };
    }
    if (String(error.code) === '23505' && idempotencyKey) {
      const { data: existing } = await supabase
        .from(TABLE)
        .select('id,effective_until')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle<{ id: string; effective_until: string | null }>();
      if (existing) {
        return {
          ok: true,
          action,
          status: 'already_applied',
          feedbackId: existing.id,
          effectiveUntil: existing.effective_until ?? undefined,
          idempotencyKey,
          qualityMeta: { writeAction: true, userConfirmedRequired: true, idempotent: true },
        };
      }
    }
    return {
      ok: false,
      action,
      status: 'error',
      actionHint: '피드백 저장에 실패했습니다. 잠시 후 다시 시도하세요.',
      idempotencyKey,
    };
  }

  return {
    ok: true,
    action,
    status: 'saved',
    feedbackId: data?.id,
    effectiveUntil: data?.effective_until ?? effectiveUntil ?? undefined,
    idempotencyKey,
    qualityMeta: { writeAction: true, userConfirmedRequired: true, idempotent: true },
  };
}

export function buildTodayCandidateFeedbackSummary(
  deck: TodayStockCandidate[],
  suppressedCount: number,
  tableMissing?: boolean,
  extra?: { reviewedRiskSuppressedCount?: number; suppressedTraces?: CandidateDecisionTrace[] },
): TodayCandidateFeedbackSummary {
  let hide7dActiveCount = 0;
  let reviewedCount = 0;
  let keepObservingCount = 0;
  let reviewedRiskCount = 0;
  for (const c of deck) {
    const s = c.userFeedbackState;
    if (!s?.active) continue;
    if (s.action === 'hide_7d') hide7dActiveCount += 1;
    if (s.action === 'mark_reviewed') {
      reviewedCount += 1;
      if (c.corporateActionRisk?.active || c.candidateAction === 'reviewed_risk') reviewedRiskCount += 1;
    }
    if (s.action === 'keep_observing') keepObservingCount += 1;
  }
  const hiddenByUserCount =
    hide7dActiveCount +
    (extra?.suppressedTraces ?? []).filter((t) => t.suppressedReasons.some((r) => r.code === 'user_hidden_7d')).length;
  return {
    status: tableMissing ? 'table_missing' : 'ok',
    hide7dActiveCount,
    reviewedCount,
    keepObservingCount,
    suppressedByFeedbackCount: suppressedCount,
    reviewedRiskCount,
    hiddenByUserCount,
    keptObservingCount: keepObservingCount,
    reviewedRiskSuppressedCount: extra?.reviewedRiskSuppressedCount ?? 0,
    ...(tableMissing ? { actionHint: feedbackTableMissingActionHint() } : {}),
  };
}

function withFeedbackTracePatch(
  c: TodayStockCandidate,
  patch: Partial<CandidateDecisionTrace>,
): TodayStockCandidate {
  const base = c.decisionTrace ?? {
    decisionStatus: 'selected' as const,
    candidateBucket: 'unknown' as const,
    selectedReasons: [],
    suppressedReasons: [],
    rejectedReasons: [],
    downgradeReasons: [],
    missingEvidence: [],
    dataQualityFlags: [],
    riskFlags: [],
    nextChecks: [],
    doNotDo: [],
  };
  return {
    ...c,
    decisionTrace: {
      ...base,
      ...patch,
      userFeedbackApplied: true,
      suppressedReasons: patch.suppressedReasons ?? base.suppressedReasons,
      downgradeReasons: patch.downgradeReasons ?? base.downgradeReasons,
    },
  };
}

export function applyTodayCandidateFeedbackToDeck(
  deck: TodayStockCandidate[],
  byKey: Map<string, TodayCandidateUserFeedbackState>,
): { deck: TodayStockCandidate[]; suppressedTraces: CandidateDecisionTrace[]; reviewedRiskCandidates: TodayStockCandidate[] } {
  const suppressedTraces: CandidateDecisionTrace[] = [];
  const reviewedRiskCandidates: TodayStockCandidate[] = [];
  const adjusted: TodayStockCandidate[] = [];

  for (const c of deck) {
    const fb = resolveCandidateFeedbackState(c, byKey);
    if (!fb?.active) {
      adjusted.push(c);
      continue;
    }

    let next: TodayStockCandidate = { ...c, userFeedbackState: fb };

    if (fb.action === 'hide_7d') {
      const criticalRisk = c.corporateActionRisk?.active === true && c.candidateAction === 'review_required';
      next = mergeScoreBreakdownIntoCandidate(next, {
        finalScore: clampObservationScore((next.scoreBreakdown?.finalScore ?? next.score) - HIDE_7D_PENALTY),
        repeatExposurePenalty: (next.scoreBreakdown?.repeatExposurePenalty ?? 0) + 4,
      });
      const suppressedReasons: CandidateTraceReason[] = [
        traceReason('user_hidden_7d', '사용자가 7일간 낮은 우선순위로 두었습니다'),
      ];
      next = withFeedbackTracePatch(next, {
        suppressedReasons: [...(next.decisionTrace?.suppressedReasons ?? []), ...suppressedReasons],
      });
      if (!criticalRisk) {
        suppressedTraces.push({
          candidateId: c.candidateId,
          symbol: c.stockCode ?? c.symbol,
          name: c.name,
          market: c.market,
          decisionStatus: 'suppressed',
          candidateBucket: next.decisionTrace?.candidateBucket ?? 'unknown',
          selectedReasons: [],
          suppressedReasons: suppressedReasons,
          rejectedReasons: [],
          downgradeReasons: next.decisionTrace?.downgradeReasons ?? [],
          missingEvidence: [],
          dataQualityFlags: [],
          riskFlags: next.decisionTrace?.riskFlags ?? [],
          nextChecks: next.decisionTrace?.nextChecks ?? [],
          doNotDo: next.decisionTrace?.doNotDo ?? [],
          userFeedbackApplied: true,
        });
        continue;
      }
    }

    if (fb.action === 'mark_reviewed') {
      next = withFeedbackTracePatch(next, {
        downgradeReasons: [
          ...(next.decisionTrace?.downgradeReasons ?? []),
          traceReason('user_marked_reviewed', '리스크 점검 완료: 메인 후보에서는 낮은 우선순위로 이동했습니다.'),
        ],
      });
      const riskReviewed = c.corporateActionRisk?.active === true || c.briefDeckSlot === 'risk_review';
      if (riskReviewed) {
        const reviewed = mergeScoreBreakdownIntoCandidate(
          {
            ...next,
            candidateAction: 'reviewed_risk',
            reasonSummary: `${next.reasonSummary} · 리스크 점검 완료`,
            cautionNotes: [
              ...next.cautionNotes,
              '리스크 점검 완료: 메인 후보에서는 낮은 우선순위로 이동했습니다.',
              '새 공시/이벤트가 감지되면 다시 표시될 수 있습니다.',
            ],
          },
          {
            finalScore: clampObservationScore((next.scoreBreakdown?.finalScore ?? next.score) - 18),
            riskPenalty: (next.scoreBreakdown?.riskPenalty ?? 0) + 6,
          },
        );
        reviewedRiskCandidates.push(reviewed);
        suppressedTraces.push({
          candidateId: c.candidateId,
          symbol: c.stockCode ?? c.symbol,
          name: c.name,
          market: c.market,
          decisionStatus: 'suppressed',
          candidateBucket: next.decisionTrace?.candidateBucket ?? 'corporate_action_risk',
          selectedReasons: [],
          suppressedReasons: [traceReason('user_marked_reviewed', '최근 점검 완료된 리스크 후보')],
          rejectedReasons: [],
          downgradeReasons: next.decisionTrace?.downgradeReasons ?? [],
          missingEvidence: [],
          dataQualityFlags: [],
          riskFlags: next.decisionTrace?.riskFlags ?? [],
          nextChecks: next.decisionTrace?.nextChecks ?? [],
          doNotDo: next.decisionTrace?.doNotDo ?? [],
          userFeedbackApplied: true,
        });
        continue;
      }
    }

    if (fb.action === 'keep_observing') {
      const pen = next.scoreBreakdown?.repeatExposurePenalty ?? 0;
      if (pen > 0) {
        const relief = Math.min(pen, KEEP_OBSERVING_REPEAT_RELIEF);
        next = mergeScoreBreakdownIntoCandidate(next, {
          finalScore: clampObservationScore((next.scoreBreakdown?.finalScore ?? next.score) + relief),
          repeatExposurePenalty: Math.max(0, pen - relief),
        });
      }
    }

    adjusted.push(next);
  }

  const hideLast = [...adjusted].sort((a, b) => {
    const ah = a.userFeedbackState?.active && a.userFeedbackState.action === 'hide_7d' ? 1 : 0;
    const bh = b.userFeedbackState?.active && b.userFeedbackState.action === 'hide_7d' ? 1 : 0;
    return ah - bh;
  });

  return { deck: hideLast, suppressedTraces, reviewedRiskCandidates };
}

export const TODAY_CANDIDATE_FEEDBACK_API_ROUTE = FEEDBACK_ROUTE;
