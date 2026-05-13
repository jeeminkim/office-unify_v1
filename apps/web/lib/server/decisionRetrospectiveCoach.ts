import 'server-only';

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DecisionRetroCoachPreview,
  DecisionRetroCoachSuggestion,
  DecisionRetroOutcome,
  DecisionRetroQualitySignal,
} from '@office-unify/shared-types';
import {
  DECISION_RETRO_OUTCOMES,
  DECISION_RETRO_QUALITY_SIGNALS,
  parseDecisionRetroOutcome,
  parseDecisionRetroSourceType,
} from '@/lib/server/decisionRetrospective';
import { isDecisionRetrospectiveTableMissingError } from '@/lib/server/decisionRetrospectiveSupabaseErrors';
import { stripDecisionRetroControlChars } from '@/lib/server/decisionRetrospectiveSanitize';
import {
  buildPbWeeklyReviewFromContext,
  buildPrivateBankerWeeklyReviewContext,
  sanitizeWeeklyReviewContext,
  stableStringifyForWeeklyReviewHash,
} from '@/lib/server/privateBankerWeeklyReview';

const TITLE_MAX = 200;
const SUMMARY_MAX = 2000;
const FIELD_MAX = 2000;
const SOURCE_ID_MAX = 128;

export const DECISION_RETRO_COACH_CAVEAT =
  'PB가 제안한 초안입니다. 자동 저장되지 않으며 사용자가 확인·수정한 뒤 저장해야 합니다. 수익률 평가가 아니라 판단 과정 복기용입니다. 자동 주문·자동 리밸런싱을 실행하지 않습니다.';

export type DecisionRetroCoachSanitizedContext = {
  generatedAt: string;
  weekOf: string;
  profileStatus: string;
  todayDeck: Array<Record<string, unknown>>;
  followups: Array<Record<string, unknown>>;
  draftRetrospectives: Array<{ id: string; sourceType: string; title: string; summary: string }>;
  weeklyReviewOutline: {
    candidateItems: number;
    followupItems: number;
    riskItems: number;
    questionItems: number;
  } | null;
};

/** 금액·통화 표기를 일반화해 PB 프롬프트/요약에서 제거한다. */
export function stripMoneyLikePatterns(text: string): string {
  return String(text ?? '')
    .replace(/(\d{1,3}(?:,\d{3})+|\d{2,})\s*(?:원|만\s*원|억\s*원|KRW|USD|\$)/gi, '[금액생략]')
    .replace(/\$\s*\d+(?:,\d{3})*(?:\.\d+)?/g, '[금액생략]')
    .replace(/\d+(?:,\d{3})*\s*원/gi, '[금액생략]');
}

function parseQualitySignalsLoose(raw: unknown): DecisionRetroQualitySignal[] {
  if (!Array.isArray(raw)) return [];
  const out: DecisionRetroQualitySignal[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    if (DECISION_RETRO_QUALITY_SIGNALS.includes(x as DecisionRetroQualitySignal)) {
      out.push(x as DecisionRetroQualitySignal);
    }
  }
  return out.slice(0, 12);
}

export async function buildDecisionRetroCoachContext(
  supabase: SupabaseClient,
  userKey: string,
): Promise<DecisionRetroCoachSanitizedContext> {
  const ctx = await buildPrivateBankerWeeklyReviewContext(supabase, userKey);
  const sanitizedDeck = sanitizeWeeklyReviewContext(ctx);
  const deckArr = (sanitizedDeck as { primaryCandidateDeck?: unknown[] }).primaryCandidateDeck ?? [];
  const followArr = (sanitizedDeck as { followups?: unknown[] }).followups ?? [];

  let draftRetrospectives: DecisionRetroCoachSanitizedContext['draftRetrospectives'] = [];
  const retroRes = await supabase
    .from('web_decision_retrospectives')
    .select('id,source_type,title,summary,status')
    .eq('user_key', userKey)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(25);

  if (!retroRes.error && Array.isArray(retroRes.data)) {
    draftRetrospectives = retroRes.data.map((r: { id: string; source_type: string; title: string; summary: string | null }) => ({
      id: r.id,
      sourceType: r.source_type,
      title: stripMoneyLikePatterns(stripDecisionRetroControlChars(String(r.title ?? ''))).slice(0, TITLE_MAX),
      summary: stripMoneyLikePatterns(stripDecisionRetroControlChars(String(r.summary ?? ''))).slice(0, SUMMARY_MAX),
    }));
  } else if (retroRes.error && !isDecisionRetrospectiveTableMissingError(retroRes.error)) {
    /* ignore row load failure — coach still works without drafts */
  }

  let weeklyReviewOutline: DecisionRetroCoachSanitizedContext['weeklyReviewOutline'] = null;
  try {
    const preview = buildPbWeeklyReviewFromContext(ctx);
    weeklyReviewOutline = {
      candidateItems: preview.sections.candidates.length,
      followupItems: preview.sections.followups.length,
      riskItems: preview.sections.risks.length,
      questionItems: preview.sections.questions.length,
    };
  } catch {
    weeklyReviewOutline = null;
  }

  const todayDeck = deckArr.map((row) => {
    const o = row as Record<string, unknown>;
    const scoreSummary = typeof o.scoreSummary === 'string' ? stripMoneyLikePatterns(o.scoreSummary) : o.scoreSummary;
    return { ...o, scoreSummary };
  });

  return {
    generatedAt: new Date().toISOString(),
    weekOf: ctx.weekOf,
    profileStatus: ctx.profileStatus,
    todayDeck,
    followups: followArr as Array<Record<string, unknown>>,
    draftRetrospectives,
    weeklyReviewOutline,
  };
}

export function countCoachContextSources(ctx: DecisionRetroCoachSanitizedContext): number {
  return (
    ctx.todayDeck.length +
    ctx.followups.length +
    ctx.draftRetrospectives.length +
    (ctx.weeklyReviewOutline ? 1 : 0)
  );
}

export function buildDecisionRetroCoachPreviewEmpty(ctx: DecisionRetroCoachSanitizedContext): DecisionRetroCoachPreview {
  return {
    suggestions: [],
    qualityMeta: {
      sourceCount: Math.max(1, countCoachContextSources(ctx)),
      suggestionCount: 0,
      sanitized: true,
      autoSaved: false,
    },
  };
}

export function buildRecommendedRetroCoachIdempotencyKey(ctx: DecisionRetroCoachSanitizedContext): string {
  const minimal = {
    weekOf: ctx.weekOf,
    todayDeck: ctx.todayDeck,
    followups: ctx.followups,
    draftIds: ctx.draftRetrospectives.map((d) => d.id),
    weeklyReviewOutline: ctx.weeklyReviewOutline,
  };
  const h = createHash('sha256').update(stableStringifyForWeeklyReviewHash(minimal), 'utf8').digest('hex').slice(0, 22);
  return `retro-coach:${h}`;
}

export function buildDecisionRetroCoachPrompt(ctx: DecisionRetroCoachSanitizedContext): string {
  const allowedSources = 'today_candidate | research_followup | pb_weekly_review | manual | pb_message';
  const allowedOutcomes = DECISION_RETRO_OUTCOMES.join(' | ');
  const lines: string[] = [];
  lines.push('[PB 판단 복기 코치 — 초안 제안 전용]');
  lines.push('역할: 사용자의 **판단 과정**을 돌아보는 복기 초안을 JSON으로만 제안한다.');
  lines.push('금지: 수익률 평가·수익/원금 보장·매수/매도/비중/리밸런싱 지시·자동 주문·자동 저장·웹_decision_retrospectives에 직접 쓰기.');
  lines.push('반드시 마지막에 단일 fenced block: ```json ... ``` 만 출력한다(그 앞에는 짧은 한국어 안내문 허용).');
  lines.push(`JSON 스키마: { "suggestions": [ { "sourceType": "${allowedSources}", "sourceId": "optional", "title": "", "summary": "", "suggestedOutcome": "${allowedOutcomes}", "suggestedQualitySignals": [], "suggestedWhatWorked": "", "suggestedWhatDidNotWork": "", "suggestedNextRule": "", "caveat": "" } ] }`);
  lines.push(`suggestions 1~5개. 각 caveat는 다음을 포함: ${DECISION_RETRO_COACH_CAVEAT}`);
  lines.push('suggestedQualitySignals는 알려진 코드 문자열만(없으면 []).');
  lines.push('');
  lines.push('--- 컨텍스트(JSON, 금액·userNote·긴 PB 원문 제거) ---');
  lines.push(JSON.stringify(ctx, null, 0));
  return lines.join('\n');
}

export function sanitizeDecisionRetroCoachSuggestion(
  raw: Partial<DecisionRetroCoachSuggestion> & Record<string, unknown>,
): DecisionRetroCoachSuggestion | null {
  const st = parseDecisionRetroSourceType(raw.sourceType);
  if (!st) return null;
  const title = stripMoneyLikePatterns(stripDecisionRetroControlChars(String(raw.title ?? '')))
    .trim()
    .slice(0, TITLE_MAX);
  if (!title) return null;
  const summary = stripMoneyLikePatterns(stripDecisionRetroControlChars(String(raw.summary ?? '')))
    .trim()
    .slice(0, SUMMARY_MAX);
  const oc: DecisionRetroOutcome = parseDecisionRetroOutcome(raw.suggestedOutcome) ?? 'unknown';
  const qs = parseQualitySignalsLoose(raw.suggestedQualitySignals);
  const sw = raw.suggestedWhatWorked != null ? stripMoneyLikePatterns(stripDecisionRetroControlChars(String(raw.suggestedWhatWorked))).trim() : '';
  const sn = raw.suggestedWhatDidNotWork != null ? stripMoneyLikePatterns(stripDecisionRetroControlChars(String(raw.suggestedWhatDidNotWork))).trim() : '';
  const nr = raw.suggestedNextRule != null ? stripMoneyLikePatterns(stripDecisionRetroControlChars(String(raw.suggestedNextRule))).trim() : '';
  const caveatRaw = raw.caveat != null ? stripDecisionRetroControlChars(String(raw.caveat)).trim() : '';
  const caveat = stripMoneyLikePatterns(caveatRaw).slice(0, 800) || DECISION_RETRO_COACH_CAVEAT;
  const sourceId =
    typeof raw.sourceId === 'string' && raw.sourceId.trim().length > 0 ? raw.sourceId.trim().slice(0, SOURCE_ID_MAX) : undefined;

  return {
    sourceType: st,
    sourceId,
    title,
    summary,
    suggestedOutcome: oc,
    suggestedQualitySignals: qs,
    ...(sw ? { suggestedWhatWorked: sw.slice(0, FIELD_MAX) } : {}),
    ...(sn ? { suggestedWhatDidNotWork: sn.slice(0, FIELD_MAX) } : {}),
    ...(nr ? { suggestedNextRule: nr.slice(0, FIELD_MAX) } : {}),
    caveat,
  };
}

export function parseDecisionRetroCoachSuggestions(text: string): {
  suggestions: DecisionRetroCoachSuggestion[];
  parseStatus: 'ok' | 'partial' | 'failed';
} {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (!fence?.[1]) return { suggestions: [], parseStatus: 'failed' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(fence[1].trim());
  } catch {
    return { suggestions: [], parseStatus: 'failed' };
  }
  const root = parsed as { suggestions?: unknown };
  if (!root || !Array.isArray(root.suggestions)) return { suggestions: [], parseStatus: 'failed' };
  const rawLen = root.suggestions.length;
  const out: DecisionRetroCoachSuggestion[] = [];
  for (const item of root.suggestions) {
    if (!item || typeof item !== 'object') continue;
    const s = sanitizeDecisionRetroCoachSuggestion(item as Partial<DecisionRetroCoachSuggestion>);
    if (s) out.push(s);
  }
  if (out.length === 0) return { suggestions: [], parseStatus: 'failed' };
  if (out.length < rawLen) return { suggestions: out, parseStatus: 'partial' };
  return { suggestions: out, parseStatus: 'ok' };
}
