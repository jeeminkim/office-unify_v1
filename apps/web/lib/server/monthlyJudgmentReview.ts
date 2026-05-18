import 'server-only';

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  JudgmentReviewDataCoverage,
  MonthlyJudgmentReview,
} from '@office-unify/shared-types';
import {
  buildImprovedBehaviors,
  buildMissedChecks,
  buildMonthlyReviewActionItems,
  buildNextMonthRules,
  computeStaleOpenItems,
  detectRepeatedJudgmentPatterns,
  pickPrimaryPattern,
} from '@/lib/server/monthlyJudgmentReviewPatterns';
import {
  buildMonthlyJudgmentReviewIdempotencyKey,
  buildMonthlyJudgmentReviewWindowKey,
  loadMonthlyJudgmentReviewSources,
  resolveJudgmentReviewWindow,
  type MonthlyJudgmentReviewSources,
} from '@/lib/server/monthlyJudgmentReviewSources';

export {
  buildMonthlyJudgmentReviewIdempotencyKey,
  buildMonthlyJudgmentReviewWindowKey,
  loadMonthlyJudgmentReviewSources,
  resolveJudgmentReviewWindow,
};

export {
  detectRepeatedJudgmentPatterns,
  buildNextMonthRules,
  buildMonthlyReviewActionItems,
};

function coverageFrom(
  tableMissing: boolean,
  count: number,
): JudgmentReviewDataCoverage {
  if (tableMissing) return 'missing';
  if (count === 0) return 'partial';
  return 'ok';
}

function computeReviewStatus(
  coverage: MonthlyJudgmentReview['qualityMeta']['dataCoverage'],
  totalSignals: number,
): MonthlyJudgmentReview['status'] {
  const missingCount = Object.values(coverage).filter((c) => c === 'missing').length;
  const okCount = Object.values(coverage).filter((c) => c === 'ok').length;
  if (missingCount >= 4) return 'insufficient_data';
  if (totalSignals < 2 && okCount === 0) return 'insufficient_data';
  if (missingCount > 0 || totalSignals < 5) return 'partial';
  return 'ready';
}

function buildHeadlineSummary(
  window: MonthlyJudgmentReview['window'],
  primaryPattern: MonthlyJudgmentReview['headline']['primaryPattern'],
  patterns: MonthlyJudgmentReview['repeatedPatterns'],
): string {
  const top = patterns.find((p) => p.patternKey !== 'good_behavior') ?? patterns[0];
  if (!top) {
    return `최근 ${window.days}일 판단 기록이 적습니다. Today Candidate·Action Item·복기를 조금 더 쌓으면 패턴 분석이 풍부해집니다.`;
  }
  switch (primaryPattern) {
    case 'risk_review_ignored':
      return `최근 ${window.days}일 리스크 점검 후보는 있었으나 확인·후속 기록이 상대적으로 적을 수 있습니다. 점검 루프를 보강해 보세요.`;
    case 'over_researching':
      return `최근 ${window.days}일 리서치 활동은 많았으나 실행·복기 연결이 적을 수 있습니다. 조사와 행동의 균형을 점검하세요.`;
    case 'under_reviewing':
      return `최근 ${window.days}일 거래·관찰 기록 대비 복기가 적습니다. 판단 복기 루프를 늘리는 것을 검토하세요.`;
    case 'sector_concentration':
      return `최근 ${window.days}일 동일 종목·테마가 여러 채널에서 반복되었습니다. 집중 노출을 점검하세요.`;
    default:
      return top.interpretation.slice(0, 240);
  }
}

export async function buildMonthlyJudgmentReview(params: {
  supabase: SupabaseClient;
  userKey: string;
  days?: number;
  startDate?: string;
  endDate?: string;
  readOnlyPreview?: boolean;
}): Promise<MonthlyJudgmentReview> {
  const window = resolveJudgmentReviewWindow({
    days: params.days,
    startDate: params.startDate,
    endDate: params.endDate,
  });
  const sources = await loadMonthlyJudgmentReviewSources(params.supabase, params.userKey, window);
  return assembleMonthlyJudgmentReview(sources, Boolean(params.readOnlyPreview ?? true));
}

export function assembleMonthlyJudgmentReview(
  sources: MonthlyJudgmentReviewSources,
  readOnlyPreview: boolean,
): MonthlyJudgmentReview {
  const nowMs = Date.now();
  const warnings: string[] = [];
  if (sources.impressions.tableMissing) {
    warnings.push('table_missing:today_candidate_impressions');
  }
  if (sources.feedback.tableMissing) warnings.push('table_missing:today_candidate_feedback');
  if (sources.actionItems.tableMissing) warnings.push('table_missing:web_action_items');
  if (sources.tradeJournal.tableMissing) warnings.push('table_missing:trade_journal');
  if (sources.retrospectives.tableMissing) warnings.push('table_missing:web_decision_retrospectives');
  if (sources.researchRuns.tableMissing) warnings.push('table_missing:research_report_runs');

  const riskReviewCount = sources.impressions.rows.filter((r) => {
    const bucket = String(r.candidate_bucket ?? '');
    return bucket.includes('risk');
  }).length;

  const actionCreated = sources.actionItems.rows.length;
  const actionDone = sources.actionItems.rows.filter((r) => r.status === 'done').length;
  const actionDismissed = sources.actionItems.rows.filter((r) => r.status === 'dismissed').length;
  const completionDenom = actionCreated - actionDismissed;
  const actionItemCompletionRatio =
    completionDenom > 0 ? Math.round((actionDone / completionDenom) * 100) / 100 : 0;

  const staleOpen = computeStaleOpenItems(sources, nowMs);
  const repeatedPatterns = detectRepeatedJudgmentPatterns(sources);
  const { primaryPattern, confidence } = pickPrimaryPattern(repeatedPatterns);
  const improvedBehaviors = buildImprovedBehaviors(sources);
  const missedChecks = buildMissedChecks(sources, staleOpen);
  const nextMonthRules = buildNextMonthRules(repeatedPatterns);
  const actionItemsToCreate = buildMonthlyReviewActionItems(nextMonthRules);

  const symbolMap = new Map<string, { name?: string; count: number }>();
  for (const r of sources.impressions.rows) {
    const sym = (r.symbol ?? '').trim().toUpperCase();
    if (!sym) continue;
    const prev = symbolMap.get(sym);
    symbolMap.set(sym, { name: r.name ?? prev?.name, count: (prev?.count ?? 0) + 1 });
  }

  const dataCoverage = {
    todayCandidates: coverageFrom(sources.impressions.tableMissing, sources.impressions.rows.length),
    actionItems: coverageFrom(sources.actionItems.tableMissing, sources.actionItems.rows.length),
    tradeJournal: coverageFrom(sources.tradeJournal.tableMissing, sources.tradeJournal.rows.length),
    retrospectives: coverageFrom(sources.retrospectives.tableMissing, sources.retrospectives.rows.length),
    researchReports: coverageFrom(sources.researchRuns.tableMissing, sources.researchRuns.rows.length),
    committee: 'partial' as JudgmentReviewDataCoverage,
    dailyReviewNotes: coverageFrom(
      sources.dailyReviewNotes?.tableMissing ?? true,
      sources.dailyReviewNotes?.rows.filter((r) => r.status === 'saved').length ?? 0,
    ),
  };

  const totalSignals =
    sources.impressions.rows.length +
    sources.actionItems.rows.length +
    sources.tradeJournal.rows.length +
    sources.retrospectives.rows.length +
    sources.researchRuns.rows.length;

  const status = computeReviewStatus(dataCoverage, totalSignals);

  const watchApproved = sources.watchlistRecommendations.rows.filter((r) => r.approval_status === 'approved').length;
  const watchRejected = sources.watchlistRecommendations.rows.filter((r) => r.approval_status === 'rejected').length;

  const lowQualityCount = sources.impressions.rows.filter((r) => r.judgment_quality_level === 'low').length;
  const concentrationWarnings: string[] = [];
  if (lowQualityCount >= 3) {
    concentrationWarnings.push(`판단 품질 low 후보 ${lowQualityCount}건 — 데이터·근거 보강이 필요할 수 있습니다.`);
  }

  return {
    window: sources.window,
    status,
    headline: {
      summary: buildHeadlineSummary(sources.window, primaryPattern, repeatedPatterns),
      primaryPattern,
      confidence,
    },
    metrics: {
      todayCandidateCount: sources.impressions.rows.length,
      riskReviewCount,
      actionItemCreatedCount: actionCreated,
      actionItemDoneCount: actionDone,
      actionItemDismissedCount: actionDismissed,
      actionItemCompletionRatio,
      tradeJournalCount: sources.tradeJournal.rows.length,
      retrospectiveCount: sources.retrospectives.rows.length,
      researchReportCount: sources.researchRuns.rows.length,
      reportDiffCount: sources.researchDiffs.rows.length,
      committeeRoadmapCount: 0,
      watchlistRecommendationApprovedCount: watchApproved,
      watchlistRecommendationRejectedCount: watchRejected,
      dailyReviewNoteCount: sources.dailyReviewNotes?.rows.length ?? 0,
      savedDailyNoteCount: sources.dailyReviewNotes?.rows.filter((r) => r.status === 'saved').length ?? 0,
      dismissedDailyNoteCount: sources.dailyReviewNotes?.rows.filter((r) => r.status === 'dismissed').length ?? 0,
    },
    repeatedPatterns,
    missedChecks,
    improvedBehaviors,
    actionQueueReview: {
      overdueCount: staleOpen.length,
      doneCount: actionDone,
      dismissedCount: actionDismissed,
      staleOpenItems: staleOpen,
    },
    portfolioBehaviorSignals: {
      concentrationWarnings,
      leverageWarnings: [],
      repeatedSectorMentions: [],
      symbolsMentionedOften: [...symbolMap.entries()]
        .map(([symbol, v]) => ({ symbol, name: v.name, count: v.count }))
        .filter((s) => s.count >= 2)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
    },
    nextMonthRules,
    actionItemsToCreate,
    qualityMeta: {
      dataCoverage,
      warnings,
      readOnlyPreview,
      generatedAt: new Date().toISOString(),
    },
  };
}

export function buildDecisionRetroSeedFromMonthlyReview(review: MonthlyJudgmentReview): {
  title: string;
  summary: string;
  detailJson: Record<string, unknown>;
} {
  const title = `30일 판단 품질 복기 (${review.window.startDate} ~ ${review.window.endDate})`;
  const parts = [
    review.headline.summary,
    `주요 패턴: ${review.headline.primaryPattern}.`,
    `Action Item 완료율 ${Math.round(review.metrics.actionItemCompletionRatio * 100)}%.`,
    `반복 패턴 ${review.repeatedPatterns.length}건, 놓친 체크 ${review.missedChecks.length}건.`,
  ];
  const summary = parts.join(' ').slice(0, 480);
  const detailJson: Record<string, unknown> = {
    seed: 'monthly_judgment_review',
    window: review.window,
    status: review.status,
    primaryPattern: review.headline.primaryPattern,
    metrics: review.metrics,
    patternKeys: review.repeatedPatterns.map((p) => p.patternKey),
    nextMonthRuleCount: review.nextMonthRules.length,
    dataCoverage: review.qualityMeta.dataCoverage,
    notTradeInstruction: true,
  };
  return { title, summary, detailJson };
}

export function hashMonthlyReviewForIdempotency(review: MonthlyJudgmentReview): string {
  const payload = JSON.stringify({
    window: review.window,
    primaryPattern: review.headline.primaryPattern,
    patternKeys: review.repeatedPatterns.map((p) => p.patternKey).sort(),
    metrics: review.metrics,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 24);
}
