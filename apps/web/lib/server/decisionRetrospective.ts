import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DecisionRetroOutcome,
  DecisionRetroQualitySignal,
  DecisionRetrospective,
  DecisionRetrospectivesQualityMeta,
  DecisionRetroSourceType,
  DecisionRetroStatus,
  PbWeeklyReview,
  ResearchFollowupRowDto,
} from '@office-unify/shared-types';
import { sanitizeFollowupUserNote } from '@/lib/server/researchFollowupTracking';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';

export { sanitizeDecisionRetroInput, stripDecisionRetroControlChars, DECISION_RETRO_TEXT_FIELD_MAX } from '@/lib/server/decisionRetrospectiveSanitize';

export const DECISION_RETRO_STALE_DRAFT_DAYS = 30;
const FOLLOWUP_STALE_TRACKING_MS = 14 * 24 * 60 * 60 * 1000;
const SUMMARY_LINE_MAX = 480;
const TITLE_MAX = 200;

export const DECISION_RETRO_SOURCE_TYPES: readonly DecisionRetroSourceType[] = [
  'today_candidate',
  'research_followup',
  'pb_weekly_review',
  'pb_message',
  'manual',
] as const;

export const DECISION_RETRO_STATUSES: readonly DecisionRetroStatus[] = [
  'draft',
  'reviewed',
  'learned',
  'archived',
] as const;

export const DECISION_RETRO_OUTCOMES: readonly DecisionRetroOutcome[] = [
  'helpful',
  'partially_helpful',
  'not_helpful',
  'unknown',
] as const;

export const DECISION_RETRO_QUALITY_SIGNALS: readonly DecisionRetroQualitySignal[] = [
  'risk_warning_useful',
  'suitability_warning_useful',
  'concentration_warning_useful',
  'data_quality_warning_useful',
  'followup_checked',
  'followup_missed',
  'pb_question_useful',
  'pb_question_too_generic',
  'thesis_invalidated',
  'unknown',
] as const;

export type DecisionRetroDbRow = {
  id: string;
  user_key: string;
  source_type: string;
  source_id: string | null;
  symbol: string | null;
  title: string;
  summary: string;
  status: string;
  outcome: string;
  quality_signals: string[] | null;
  detail_json: Record<string, unknown> | null;
  what_worked: string | null;
  what_did_not_work: string | null;
  next_rule: string | null;
  created_at: string;
  updated_at: string;
};

export type DecisionRetroStatsRow = {
  status: string;
  outcome: string;
  quality_signals: string[] | null;
  created_at: string;
};

function truncateText(raw: string, max: number): string {
  const s = String(raw ?? '');
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

export function parseDecisionRetroSourceType(v: unknown): DecisionRetroSourceType | null {
  if (typeof v !== 'string') return null;
  return DECISION_RETRO_SOURCE_TYPES.includes(v as DecisionRetroSourceType) ? (v as DecisionRetroSourceType) : null;
}

export function parseDecisionRetroStatus(v: unknown): DecisionRetroStatus | null {
  if (typeof v !== 'string') return null;
  return DECISION_RETRO_STATUSES.includes(v as DecisionRetroStatus) ? (v as DecisionRetroStatus) : null;
}

export function parseDecisionRetroOutcome(v: unknown): DecisionRetroOutcome | null {
  if (typeof v !== 'string') return null;
  return DECISION_RETRO_OUTCOMES.includes(v as DecisionRetroOutcome) ? (v as DecisionRetroOutcome) : null;
}

export function parseDecisionRetroQualitySignals(raw: unknown): DecisionRetroQualitySignal[] | null {
  if (!Array.isArray(raw)) return null;
  const out: DecisionRetroQualitySignal[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') return null;
    if (!DECISION_RETRO_QUALITY_SIGNALS.includes(x as DecisionRetroQualitySignal)) return null;
    out.push(x as DecisionRetroQualitySignal);
  }
  return out;
}

export function mapDecisionRetroDbRowToApi(row: DecisionRetroDbRow): DecisionRetrospective {
  const qs = Array.isArray(row.quality_signals) ? row.quality_signals : [];
  return {
    id: row.id,
    sourceType: row.source_type as DecisionRetroSourceType,
    sourceId: row.source_id ?? undefined,
    symbol: row.symbol ?? undefined,
    title: row.title,
    summary: row.summary ?? '',
    status: row.status as DecisionRetroStatus,
    outcome: row.outcome as DecisionRetroOutcome,
    qualitySignals: qs as DecisionRetroQualitySignal[],
    whatWorked: row.what_worked ?? undefined,
    whatDidNotWork: row.what_did_not_work ?? undefined,
    nextRule: row.next_rule ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function computeDecisionRetrospectivesQualityMeta(
  rows: DecisionRetroStatsRow[],
  nowMs: number,
): DecisionRetrospectivesQualityMeta {
  const staleMs = DECISION_RETRO_STALE_DRAFT_DAYS * 24 * 60 * 60 * 1000;
  const statusCounts: Partial<Record<DecisionRetroStatus, number>> = {};
  const outcomeCounts: Partial<Record<DecisionRetroOutcome, number>> = {};
  const qualitySignalCounts: Partial<Record<DecisionRetroQualitySignal, number>> = {};
  let staleDraftCount = 0;
  let learnedCount = 0;

  for (const r of rows) {
    const st = r.status as DecisionRetroStatus;
    statusCounts[st] = (statusCounts[st] ?? 0) + 1;
    const oc = r.outcome as DecisionRetroOutcome;
    outcomeCounts[oc] = (outcomeCounts[oc] ?? 0) + 1;
    const created = new Date(r.created_at).getTime();
    if (st === 'draft' && Number.isFinite(created) && nowMs - created >= staleMs) {
      staleDraftCount += 1;
    }
    if (st === 'learned') learnedCount += 1;
    const arr = Array.isArray(r.quality_signals) ? r.quality_signals : [];
    for (const sig of arr) {
      const k = sig as DecisionRetroQualitySignal;
      qualitySignalCounts[k] = (qualitySignalCounts[k] ?? 0) + 1;
    }
  }

  return {
    totalCount: rows.length,
    statusCounts,
    outcomeCounts,
    qualitySignalCounts,
    staleDraftCount,
    learnedCount,
  };
}

export function buildDecisionRetroSeedFromTodayCandidate(candidate: TodayStockCandidate): {
  title: string;
  summary: string;
  symbol?: string;
  detailJson: Record<string, unknown>;
} {
  const sym = (candidate.symbol ?? candidate.stockCode ?? '').trim() || undefined;
  const title = truncateText(`${candidate.name} 관찰 복기`, TITLE_MAX);
  const parts: string[] = [];
  const dm = candidate.displayMetrics;
  if (dm) {
    parts.push(`관찰 점수 ${dm.observationScore} (${dm.scoreLabel}).`);
    const codes = dm.scoreExplanationDetail?.factors?.map((f) => f.code).filter(Boolean);
    if (codes && codes.length > 0) {
      parts.push(`요인 코드: ${truncateText(codes.slice(0, 6).join(', '), 120)}.`);
    } else if (dm.scoreExplanation) {
      parts.push(truncateText(dm.scoreExplanation, 160));
    }
  }
  if (candidate.reasonSummary) {
    parts.push(truncateText(candidate.reasonSummary, 200));
  }
  const suit = candidate.suitabilityAssessment;
  if (suit && suit.warningCodes?.length) {
    parts.push(`적합성 경고 코드: ${suit.warningCodes.slice(0, 5).join(', ')}.`);
  }
  const conc = candidate.concentrationRiskAssessment;
  if (conc) {
    parts.push(
      `집중도 레벨 ${conc.level}, 데이터품질 ${conc.dataQuality}, 테마매핑신뢰도 ${conc.themeMappingConfidence ?? 'unknown'}.`,
    );
    if (conc.reasonCodes?.length) {
      parts.push(`집중도 사유 코드: ${conc.reasonCodes.slice(0, 5).join(', ')}.`);
    }
  }
  const dq = candidate.dataQuality;
  if (dq?.overall) {
    parts.push(`후보 데이터 품질: ${dq.overall}.`);
  }
  const summary = truncateText(parts.join(' '), SUMMARY_LINE_MAX);
  const detailJson: Record<string, unknown> = {
    seed: 'today_candidate',
    candidateId: candidate.candidateId,
    confidence: candidate.confidence,
    riskLevel: candidate.riskLevel,
    source: candidate.source,
    scoreFactorCodes: dm?.scoreExplanationDetail?.factors?.map((f) => f.code).slice(0, 12) ?? [],
  };
  return { title, summary, symbol: sym, detailJson };
}

export function buildDecisionRetroSeedFromFollowup(row: ResearchFollowupRowDto, nowMs: number): {
  title: string;
  summary: string;
  symbol?: string;
  detailJson: Record<string, unknown>;
} {
  const title = truncateText(`Follow-up 복기: ${row.title}`, TITLE_MAX);
  const updated = new Date(row.updated_at).getTime();
  const staleTracking =
    row.status === 'tracking' && Number.isFinite(updated) && nowMs - updated >= FOLLOWUP_STALE_TRACKING_MS;
  const dj = row.detail_json && typeof row.detail_json === 'object' ? row.detail_json : {};
  const bullets = Array.isArray((dj as { bullets?: unknown }).bullets)
    ? ((dj as { bullets?: string[] }).bullets ?? []).slice(0, 2)
    : [];
  const noteSan = sanitizeFollowupUserNote((dj as { userNote?: unknown }).userNote as string | undefined);
  const noteHint =
    noteSan && noteSan.length > 0
      ? `메모 있음(길이 ${Math.min(noteSan.length, 999)}자, 원문 미저장).`
      : '메모 없음.';
  const parts = [
    `카테고리 ${row.category}, 우선순위 ${row.priority}, 상태 ${row.status}.`,
    staleTracking ? '추적 상태가 14일 이상 갱신되지 않았습니다.' : '추적 지연 신호는 없습니다.',
    noteHint,
  ];
  if (bullets.length) {
    parts.push(`불릿 요약: ${truncateText(bullets.join(' / '), 200)}`);
  }
  const sym = row.symbol?.trim() || undefined;
  const summary = truncateText(parts.join(' '), SUMMARY_LINE_MAX);
  const detailJson: Record<string, unknown> = {
    seed: 'research_followup',
    followupId: row.id,
    category: row.category,
    priority: row.priority,
    status: row.status,
    staleTracking,
    bulletCount: bullets.length,
    hasUserNote: Boolean(noteSan),
  };
  return { title, summary, symbol: sym, detailJson };
}

export function buildDecisionRetroSeedFromPbWeeklyReview(review: PbWeeklyReview): {
  title: string;
  summary: string;
  detailJson: Record<string, unknown>;
} {
  const title = truncateText(`PB 주간 점검 복기 (${review.weekOf})`, TITLE_MAX);
  const q = review.sections.questions.slice(0, 2).map((x) => truncateText(x.title, 80));
  const rsk = review.sections.risks.slice(0, 2).map((x) => truncateText(x.title, 80));
  const fu = review.sections.followups.slice(0, 2).map((x) => truncateText(x.title, 80));
  const parts = [
    `질문 ${review.sections.questions.length}건, 리스크 ${review.sections.risks.length}건, follow-up ${review.sections.followups.length}건.`,
    q.length ? `대표 질문: ${q.join(' · ')}.` : '',
    rsk.length ? `대표 리스크: ${rsk.join(' · ')}.` : '',
    fu.length ? `대표 follow-up: ${fu.join(' · ')}.` : '',
    `데이터 품질 메타: ${review.qualityMeta.dataQuality}.`,
  ].filter(Boolean);
  const summary = truncateText(parts.join(' '), SUMMARY_LINE_MAX);
  const detailJson: Record<string, unknown> = {
    seed: 'pb_weekly_review',
    weekOf: review.weekOf,
    questionCount: review.sections.questions.length,
    riskCount: review.sections.risks.length,
    followupCount: review.sections.followups.length,
    dataQuality: review.qualityMeta.dataQuality,
    profileStatus: review.profileStatus,
  };
  return { title, summary, detailJson };
}

export async function fetchDecisionRetroByIdForUser(
  supabase: SupabaseClient,
  userKey: string,
  id: string,
): Promise<{ row: DecisionRetroDbRow | null; error: { message: string; code?: string } | null }> {
  const res = await supabase
    .from('web_decision_retrospectives')
    .select('*')
    .eq('user_key', userKey)
    .eq('id', id)
    .maybeSingle();
  if (res.error) {
    return { row: null, error: res.error };
  }
  return { row: (res.data ?? null) as DecisionRetroDbRow | null, error: null };
}

export async function fetchDecisionRetroByUserSource(
  supabase: SupabaseClient,
  userKey: string,
  sourceType: DecisionRetroSourceType,
  sourceId: string,
): Promise<{ row: DecisionRetroDbRow | null; error: { message: string; code?: string } | null }> {
  const res = await supabase
    .from('web_decision_retrospectives')
    .select('*')
    .eq('user_key', userKey)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (res.error) {
    return { row: null, error: res.error };
  }
  return { row: (res.data ?? null) as DecisionRetroDbRow | null, error: null };
}

export async function fetchResearchFollowupByIdForUserDecision(
  supabase: SupabaseClient,
  userKey: string,
  id: string,
): Promise<{ row: ResearchFollowupRowDto | null; error: { message: string; code?: string } | null }> {
  const res = await supabase
    .from('web_research_followup_items')
    .select('*')
    .eq('user_key', userKey)
    .eq('id', id)
    .maybeSingle();
  if (res.error) {
    return { row: null, error: res.error };
  }
  return { row: (res.data ?? null) as ResearchFollowupRowDto | null, error: null };
}
