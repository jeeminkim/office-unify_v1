import 'server-only';

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfficeUserKey, UserPersonalizationContext } from '@office-unify/shared-types';
import { listActionItemsForUser, selectPersonaLongTermSummary } from '@office-unify/supabase-access';
import { getInvestorProfileForUser } from '@/lib/server/investorProfile';
import {
  buildMissedChecks,
  buildNextMonthRules,
  computeStaleOpenItems,
  detectRepeatedJudgmentPatterns,
} from '@/lib/server/monthlyJudgmentReviewPatterns';
import {
  loadMonthlyJudgmentReviewSources,
  resolveJudgmentReviewWindow,
} from '@/lib/server/monthlyJudgmentReviewSources';
import { listDailyReviewNotes } from '@/lib/server/dailyReviewNotesStore';
import { isActionItemTableMissingError } from '@/lib/server/actionItemService';
import { getPortfolioExposureSnapshotForUser } from '@/lib/server/concentrationRisk';
import {
  buildPersonalizationContextSummary,
  buildPersonalizationPromptBlock,
} from '@/lib/server/userPersonalizationPromptBlock';
import { getPbDailyPersonalizationSignals, getUserInvestmentMemoryContext } from '@/lib/server/privateBankerMemoryStore';
import { COMMITTEE_LT_MEMORY_KEY, PRIVATE_BANKER_LT_MEMORY_KEY } from '@office-unify/ai-office-engine';

const STALE_DAYS = 7;
function hashUserKey(userKey: string): string {
  return createHash('sha256').update(userKey).digest('hex').slice(0, 12);
}

function mapRiskTone(
  concentration: string,
  riskTolerance: string,
): UserPersonalizationContext['profile']['riskTone'] {
  if (concentration === 'strict' || riskTolerance === 'low') return 'strict';
  if (concentration === 'flexible' || riskTolerance === 'high') return 'flexible';
  if (concentration === 'moderate' || riskTolerance === 'medium') return 'moderate';
  return 'unknown';
}

function ageDays(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

function emptyContext(userKey: string, missingSources: string[]): UserPersonalizationContext {
  const generatedAt = new Date().toISOString();
  const base: UserPersonalizationContext = {
    userKeyHash: hashUserKey(userKey),
    generatedAt,
    profile: {
      status: 'missing',
      riskTone: 'unknown',
      summaryLines: ['투자자 프로필이 없습니다. 기본 확인·복기 관점으로 답합니다.'],
    },
    currentWorkload: {
      openActionItemCount: 0,
      staleActionItemCount: 0,
      riskReviewCount: 0,
      topOpenActions: [],
    },
    recentFeedback: {
      hide7dCount: 0,
      reviewedCount: 0,
      keepObservingCount: 0,
      summaryLines: [],
    },
    judgmentPatterns: {
      status: 'missing',
      repeatedPatterns: [],
      missedChecks: [],
      nextRules: [],
    },
    dataQuality: { blockers: [], warnings: [] },
    promptBlock: { compactKo: '' },
    qualityMeta: { sources: [], missingSources, readOnly: true },
  };
  base.promptBlock = buildPersonalizationPromptBlock(base);
  return base;
}

async function loadFeedbackCounts(
  supabase: SupabaseClient,
  userKey: string,
): Promise<{ hide7d: number; reviewed: number; observing: number; tableMissing: boolean }> {
  const { data, error } = await supabase
    .from('today_candidate_feedback')
    .select('feedback_action,effective_until,created_at')
    .eq('user_key', userKey)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    const msg = String(error.message ?? '').toLowerCase();
    if (msg.includes('today_candidate_feedback') && msg.includes('does not exist')) {
      return { hide7d: 0, reviewed: 0, observing: 0, tableMissing: true };
    }
    return { hide7d: 0, reviewed: 0, observing: 0, tableMissing: false };
  }
  let hide7d = 0;
  let reviewed = 0;
  let observing = 0;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const row of data ?? []) {
    const action = String((row as { feedback_action?: string }).feedback_action ?? '');
    const until = (row as { effective_until?: string | null }).effective_until;
    const created = (row as { created_at?: string }).created_at ?? '';
    const activeHide =
      action === 'hide_7d' && (!until || Date.parse(until) > Date.now());
    if (activeHide) hide7d += 1;
    if (action === 'mark_reviewed' && Date.parse(created) >= weekAgo) reviewed += 1;
    if (action === 'keep_observing' && Date.parse(created) >= weekAgo) observing += 1;
  }
  return { hide7d, reviewed, observing, tableMissing: false };
}

/**
 * Read-only aggregate — no DB writes.
 */
export async function buildUserPersonalizationContext(
  supabase: SupabaseClient,
  userKey: OfficeUserKey | string,
): Promise<UserPersonalizationContext> {
  const key = String(userKey);
  const sources: string[] = [];
  const missingSources: string[] = [];

  try {
    const generatedAt = new Date().toISOString();

    let profileStatus: UserPersonalizationContext['profile']['status'] = 'missing';
    let riskTone: UserPersonalizationContext['profile']['riskTone'] = 'unknown';
    let horizon: string | undefined;
    let leverageAllowed: boolean | undefined;
    let concentrationPreference: string | undefined;
    const profileSummaryLines: string[] = [];

    try {
      const ip = await getInvestorProfileForUser(supabase, key);
      if (!ip.ok && ip.code === 'table_missing') {
        missingSources.push('investor_profile');
        profileSummaryLines.push('프로필 테이블 미적용');
      } else if (ip.ok && ip.profile) {
        profileStatus =
          ip.profileStatus === 'complete'
            ? 'available'
            : ip.profileStatus === 'partial'
              ? 'partial'
              : 'missing';
        sources.push('investor_profile');
        riskTone = mapRiskTone(ip.profile.concentrationLimit, ip.profile.riskTolerance);
        horizon = ip.profile.timeHorizon !== 'unknown' ? ip.profile.timeHorizon : undefined;
        leverageAllowed =
          ip.profile.leveragePolicy === 'allowed'
            ? true
            : ip.profile.leveragePolicy === 'not_allowed'
              ? false
              : undefined;
        concentrationPreference =
          ip.profile.concentrationLimit !== 'unknown' ? ip.profile.concentrationLimit : undefined;
        if (ip.profile.riskTolerance !== 'unknown') {
          profileSummaryLines.push(`손실 허용 성향 코드: ${ip.profile.riskTolerance}`);
        }
        if (ip.profile.preferredSectors?.length) {
          profileSummaryLines.push(`선호 섹터(코드): ${ip.profile.preferredSectors.slice(0, 5).join(', ')}`);
        }
        if (ip.profile.avoidSectors?.length) {
          profileSummaryLines.push(`회피 섹터(코드): ${ip.profile.avoidSectors.slice(0, 5).join(', ')}`);
        }
      } else if (ip.ok && ip.profileStatus === 'missing') {
        missingSources.push('investor_profile');
        profileSummaryLines.push('프로필 미입력');
      }
    } catch {
      missingSources.push('investor_profile');
    }

    let openActionItemCount = 0;
    let staleActionItemCount = 0;
    let riskReviewCount = 0;
    const topOpenActions: UserPersonalizationContext['currentWorkload']['topOpenActions'] = [];

    try {
      const rows = await listActionItemsForUser(supabase, key, { limit: 300 });
      sources.push('action_items');
      const open = rows.filter((r) => r.status === 'open' || r.status === 'in_progress');
      openActionItemCount = open.length;
      const stale = open.filter((r) => ageDays(r.updated_at) >= STALE_DAYS);
      staleActionItemCount = stale.length;
      riskReviewCount = open.filter(
        (r) =>
          r.source_type === 'today_candidate' ||
          /리스크|risk/i.test(r.title) ||
          r.priority === 'high',
      ).length;
      const sorted = [...open].sort((a, b) => ageDays(b.updated_at) - ageDays(a.updated_at));
      for (const r of sorted.slice(0, 3)) {
        topOpenActions.push({
          title: r.title.slice(0, 120),
          sourceType: r.source_type,
          priority: r.priority,
          ageDays: ageDays(r.updated_at),
        });
      }
    } catch (e: unknown) {
      if (isActionItemTableMissingError(e)) {
        missingSources.push('action_items');
      }
    }

    const fb = await loadFeedbackCounts(supabase, key);
    if (!fb.tableMissing) sources.push('today_candidate_feedback');
    else missingSources.push('today_candidate_feedback');
    const feedbackSummaryLines: string[] = [];
    if (fb.hide7d > 0) feedbackSummaryLines.push(`hide_7d 활성 ${fb.hide7d}건`);
    if (fb.reviewed > 0) feedbackSummaryLines.push(`최근 7일 mark_reviewed ${fb.reviewed}건`);
    if (fb.observing > 0) feedbackSummaryLines.push(`최근 7일 keep_observing ${fb.observing}건`);

    let pbDailyNoteCount = 0;
    let deterministicDailyNoteCount = 0;
    let recentSavedNoteCount = 0;
    try {
      const listed = await listDailyReviewNotes(supabase, key, { status: 'saved' });
      if (!listed.tableMissing) {
        sources.push('daily_review_notes');
        const notes = listed.notes.filter((n) => ageDays(n.createdAt) <= 30);
        recentSavedNoteCount = notes.length;
        pbDailyNoteCount = notes.filter((n) => n.generatedBy === 'pb').length;
        deterministicDailyNoteCount = notes.filter((n) => n.generatedBy === 'deterministic').length;
        const usData = notes.filter((n) => n.subjectType === 'us_data').length;
        if (usData >= 2) {
          feedbackSummaryLines.push(`최근 us_data 일일 메모 ${usData}건(데이터 점검 반복 가능)`);
        }
      } else {
        missingSources.push('daily_review_notes');
      }
    } catch {
      missingSources.push('daily_review_notes');
    }

    let judgmentStatus: UserPersonalizationContext['judgmentPatterns']['status'] = 'missing';
    const repeatedPatterns: string[] = [];
    const missedChecks: string[] = [];
    const nextRules: string[] = [];

    try {
      const window = resolveJudgmentReviewWindow({ days: 30 });
      const jSources = await loadMonthlyJudgmentReviewSources(supabase, key, window);
      const patterns = detectRepeatedJudgmentPatterns(jSources);
      const staleOpen = computeStaleOpenItems(jSources, Date.now());
      const missed = buildMissedChecks(jSources, staleOpen);
      const rules = buildNextMonthRules(patterns);
      const signalCount =
        jSources.impressions.rows.length +
        jSources.feedback.rows.length +
        jSources.actionItems.rows.length;
      if (signalCount < 2) {
        judgmentStatus = 'insufficient_data';
        missingSources.push('judgment_patterns_insufficient');
      } else {
        judgmentStatus = 'available';
        sources.push('judgment_review');
      }
      for (const p of patterns.slice(0, 3)) {
        repeatedPatterns.push(p.label);
      }
      for (const m of missed.slice(0, 3)) {
        missedChecks.push(m.label);
      }
      for (const r of rules.slice(0, 3)) {
        nextRules.push(r.ruleTitle.slice(0, 120));
      }
    } catch {
      missingSources.push('judgment_review');
      judgmentStatus = 'missing';
    }

    const blockers: string[] = [];
    const warnings: string[] = [];
    if (missingSources.includes('investor_profile')) {
      blockers.push('투자자 프로필 테이블/데이터 없음 — /ops/sql-readiness 확인');
    }
    if (missingSources.includes('action_items')) {
      blockers.push('Action Items 테이블 미적용');
    }

    try {
      const snap = await getPortfolioExposureSnapshotForUser(supabase, key as OfficeUserKey);
      if (snap && snap.dataQuality !== 'missing') {
        sources.push('portfolio_exposure');
        const overweightSymbols = Object.values(snap.symbolWeightPct).filter((w) => w >= 25).length;
        const overweightThemes = Object.values(snap.themeWeightPct).filter((w) => w >= 35).length;
        if (overweightSymbols > 0) {
          warnings.push(`단일 종목 비중 25% 이상 후보 ${overweightSymbols}건(심볼·%만 집계)`);
        }
        if (overweightThemes > 0) {
          warnings.push(`테마 비중 35% 이상 후보 ${overweightThemes}건`);
        }
        if (snap.quotePartial) warnings.push('일부 시세 미확인 — 판단 전 quote 점검 우선');
      }
    } catch {
      /* optional */
    }

    let pbLtAvailable = false;
    let committeeLtAvailable = false;
    let investmentMemoryLines: string[] = [];
    let recentPbThemes: string[] = [];
    let recentPbSymbols: string[] = [];
    let recentPbCheckpoints: string[] = [];
    let recentPbEmotionShifts: string[] = [];
    try {
      const [pbLt, committeeLt] = await Promise.all([
        selectPersonaLongTermSummary(supabase, key as OfficeUserKey, PRIVATE_BANKER_LT_MEMORY_KEY),
        selectPersonaLongTermSummary(supabase, key as OfficeUserKey, COMMITTEE_LT_MEMORY_KEY),
      ]);
      pbLtAvailable = Boolean(pbLt?.trim());
      committeeLtAvailable = Boolean(committeeLt?.trim());
      if (pbLtAvailable || committeeLtAvailable) sources.push('long_term_memory');
    } catch {
      missingSources.push('long_term_memory');
    }

    try {
      const memoryContext = await getUserInvestmentMemoryContext(supabase, key as OfficeUserKey, 5);
      if (memoryContext?.trim()) {
        investmentMemoryLines = memoryContext.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 5);
        sources.push('user_investment_memory');
      }
    } catch {
      missingSources.push('user_investment_memory');
    }

    try {
      const pbSignals = await getPbDailyPersonalizationSignals(supabase, key as OfficeUserKey, 30);
      if (pbSignals) {
        recentPbThemes = pbSignals.themes;
        recentPbSymbols = pbSignals.symbols;
        recentPbCheckpoints = pbSignals.checkpoints;
        recentPbEmotionShifts = pbSignals.emotionShifts;
        sources.push('pb_daily_conversations');
      }
    } catch {
      missingSources.push('pb_daily_conversations');
    }

    if (recentSavedNoteCount > 0) {
      profileSummaryLines.push(
        `최근 Daily Review 저장 ${recentSavedNoteCount}건 (PB ${pbDailyNoteCount}, deterministic ${deterministicDailyNoteCount})`,
      );
    }

    const ctxBase: UserPersonalizationContext = {
      userKeyHash: hashUserKey(key),
      generatedAt,
      profile: {
        status: profileStatus,
        riskTone,
        horizon,
        leverageAllowed,
        concentrationPreference,
        summaryLines: profileSummaryLines,
      },
      currentWorkload: {
        openActionItemCount,
        staleActionItemCount,
        riskReviewCount,
        topOpenActions,
      },
      recentFeedback: {
        hide7dCount: fb.hide7d,
        reviewedCount: fb.reviewed,
        keepObservingCount: fb.observing,
        summaryLines: feedbackSummaryLines,
      },
      judgmentPatterns: {
        status: judgmentStatus,
        repeatedPatterns,
        missedChecks,
        nextRules,
      },
      dataQuality: { blockers, warnings },
      memorySummary: {
        pbLtAvailable,
        committeeLtAvailable,
        investmentMemoryLines,
        recentPbThemes,
        recentPbSymbols,
        recentPbCheckpoints,
        recentPbEmotionShifts,
      },
      promptBlock: { compactKo: '' },
      qualityMeta: { sources, missingSources, readOnly: true },
    };

    ctxBase.promptBlock = buildPersonalizationPromptBlock(ctxBase);
    return ctxBase;
  } catch {
    return emptyContext(key, ['builder_error']);
  }
}

export async function loadUserPersonalizationBundle(
  supabase: SupabaseClient,
  userKey: OfficeUserKey | string,
): Promise<{
  context: UserPersonalizationContext;
  promptAppend: string;
  summary: import('@office-unify/shared-types').PersonalizationContextSummary;
}> {
  const context = await buildUserPersonalizationContext(supabase, userKey);
  return {
    context,
    promptAppend: context.promptBlock.compactKo,
    summary: buildPersonalizationContextSummary(context),
  };
}
