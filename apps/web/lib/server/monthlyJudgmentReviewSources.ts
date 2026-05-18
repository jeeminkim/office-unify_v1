import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfficeUserKey } from '@office-unify/shared-types';
import { listActionItemsForUser, listTradeJournalEntries } from '@office-unify/supabase-access';
import type { JudgmentReviewWindow } from '@office-unify/shared-types';

function isTableMissing(msg: string, table: string): boolean {
  const m = msg.toLowerCase();
  return m.includes(table.toLowerCase()) || m.includes('does not exist') || m.includes('schema cache');
}

export type MonthlyJudgmentReviewSources = {
  window: JudgmentReviewWindow;
  impressions: {
    rows: Array<{
      symbol: string | null;
      name: string | null;
      run_date: string;
      judgment_quality_level: string | null;
      candidate_bucket: string | null;
      decision_status: string | null;
      suppressed_reasons: unknown;
      rejected_reasons: unknown;
      missing_evidence: unknown;
      decision_trace: Record<string, unknown>;
    }>;
    tableMissing: boolean;
  };
  feedback: {
    rows: Array<{
      symbol: string | null;
      candidate_id: string | null;
      feedback_action: string;
      created_at: string;
    }>;
    tableMissing: boolean;
  };
  actionItems: {
    rows: Awaited<ReturnType<typeof listActionItemsForUser>>;
    tableMissing: boolean;
  };
  tradeJournal: {
    rows: Awaited<ReturnType<typeof listTradeJournalEntries>>;
    tableMissing: boolean;
  };
  retrospectives: {
    rows: Array<{
      id: string;
      status: string;
      source_type: string;
      symbol: string | null;
      title: string;
      quality_signals: string[] | null;
      created_at: string;
    }>;
    tableMissing: boolean;
  };
  researchRuns: {
    rows: Array<{ id: string; symbol: string; report_date: string; generated_at: string }>;
    tableMissing: boolean;
  };
  researchDiffs: {
    rows: Array<{ id: string; symbol: string; created_at: string }>;
    tableMissing: boolean;
  };
  sectorRadarRuns: {
    rows: Array<{ id: string; run_date: string; generated_at: string }>;
    tableMissing: boolean;
  };
  watchlistRecommendations: {
    rows: Array<{ symbol: string; approval_status: string; created_at: string }>;
    tableMissing: boolean;
  };
  dailyReviewNotes: {
    rows: Array<{
      id: string;
      review_date: string;
      subject_type: string;
      symbol: string | null;
      name: string | null;
      note_summary: string;
      status: string;
      created_at: string;
    }>;
    tableMissing: boolean;
  };
};

export function resolveJudgmentReviewWindow(params: {
  days?: number;
  startDate?: string;
  endDate?: string;
  ref?: Date;
}): JudgmentReviewWindow {
  const ref = params.ref ?? new Date();
  const endDate =
    params.endDate?.trim() ||
    new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(ref);
  const days = Math.max(7, Math.min(90, params.days ?? 30));
  let startDate = params.startDate?.trim();
  if (!startDate) {
    const d = new Date(`${endDate}T12:00:00+09:00`);
    d.setDate(d.getDate() - (days - 1));
    startDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(d);
  }
  return { startDate, endDate, days };
}

export function buildMonthlyJudgmentReviewWindowKey(window: JudgmentReviewWindow): string {
  return `${window.startDate}_${window.endDate}`;
}

export function buildMonthlyJudgmentReviewIdempotencyKey(userKey: string, window: JudgmentReviewWindow): string {
  return `monthly-judgment-review:${userKey}:${buildMonthlyJudgmentReviewWindowKey(window)}`;
}

function inWindow(isoOrYmd: string, window: JudgmentReviewWindow): boolean {
  const day = isoOrYmd.slice(0, 10);
  return day >= window.startDate && day <= window.endDate;
}

export async function loadMonthlyJudgmentReviewSources(
  supabase: SupabaseClient,
  userKey: string,
  window: JudgmentReviewWindow,
): Promise<MonthlyJudgmentReviewSources> {
  const impressionsRes = await supabase
    .from('today_candidate_impressions')
    .select(
      'symbol,name,run_date,judgment_quality_level,candidate_bucket,decision_status,suppressed_reasons,rejected_reasons,missing_evidence,decision_trace',
    )
    .eq('user_key', userKey)
    .gte('run_date', window.startDate)
    .lte('run_date', window.endDate)
    .order('run_date', { ascending: false })
    .limit(800);

  let impressionsTableMissing = false;
  let impressionRows: MonthlyJudgmentReviewSources['impressions']['rows'] = [];
  if (impressionsRes.error) {
    if (isTableMissing(impressionsRes.error.message, 'today_candidate_impressions')) {
      impressionsTableMissing = true;
    }
  } else {
    impressionRows = (impressionsRes.data ?? []) as MonthlyJudgmentReviewSources['impressions']['rows'];
  }

  const feedbackRes = await supabase
    .from('today_candidate_feedback')
    .select('symbol,candidate_id,feedback_action,created_at')
    .eq('user_key', userKey)
    .gte('created_at', `${window.startDate}T00:00:00.000Z`)
    .order('created_at', { ascending: false })
    .limit(500);

  let feedbackTableMissing = false;
  let feedbackRows: MonthlyJudgmentReviewSources['feedback']['rows'] = [];
  if (feedbackRes.error) {
    if (isTableMissing(feedbackRes.error.message, 'today_candidate_feedback')) {
      feedbackTableMissing = true;
    }
  } else {
    feedbackRows = ((feedbackRes.data ?? []) as MonthlyJudgmentReviewSources['feedback']['rows']).filter((r) =>
      inWindow(r.created_at, window),
    );
  }

  let actionItemsTableMissing = false;
  let actionItemRows: MonthlyJudgmentReviewSources['actionItems']['rows'] = [];
  try {
    actionItemRows = await listActionItemsForUser(supabase, userKey, { limit: 300 });
    actionItemRows = actionItemRows.filter((r) => inWindow(r.created_at, window));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isTableMissing(msg, 'web_action_items')) actionItemsTableMissing = true;
  }

  let tradeJournalTableMissing = false;
  let tradeJournalRows: MonthlyJudgmentReviewSources['tradeJournal']['rows'] = [];
  try {
    tradeJournalRows = await listTradeJournalEntries(supabase, userKey as OfficeUserKey, 200);
    tradeJournalRows = tradeJournalRows.filter((e) => inWindow(e.tradeDate, window));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isTableMissing(msg, 'trade_journal')) tradeJournalTableMissing = true;
  }

  const retroRes = await supabase
    .from('web_decision_retrospectives')
    .select('id,status,source_type,symbol,title,quality_signals,created_at')
    .eq('user_key', userKey)
    .gte('created_at', `${window.startDate}T00:00:00.000Z`)
    .order('created_at', { ascending: false })
    .limit(300);

  let retrospectivesTableMissing = false;
  let retroRows: MonthlyJudgmentReviewSources['retrospectives']['rows'] = [];
  if (retroRes.error) {
    if (isTableMissing(retroRes.error.message, 'web_decision_retrospectives')) {
      retrospectivesTableMissing = true;
    }
  } else {
    retroRows = ((retroRes.data ?? []) as MonthlyJudgmentReviewSources['retrospectives']['rows']).filter((r) =>
      inWindow(r.created_at, window),
    );
  }

  const researchRunsRes = await supabase
    .from('research_report_runs')
    .select('id,symbol,report_date,generated_at')
    .eq('user_key', userKey)
    .eq('status', 'completed')
    .gte('report_date', window.startDate)
    .lte('report_date', window.endDate)
    .order('generated_at', { ascending: false })
    .limit(200);

  let researchRunsTableMissing = false;
  let researchRunRows: MonthlyJudgmentReviewSources['researchRuns']['rows'] = [];
  if (researchRunsRes.error) {
    if (isTableMissing(researchRunsRes.error.message, 'research_report_runs')) {
      researchRunsTableMissing = true;
    }
  } else {
    researchRunRows = (researchRunsRes.data ?? []) as MonthlyJudgmentReviewSources['researchRuns']['rows'];
  }

  const researchDiffsRes = await supabase
    .from('research_report_diffs')
    .select('id,symbol,created_at')
    .eq('user_key', userKey)
    .gte('created_at', `${window.startDate}T00:00:00.000Z`)
    .order('created_at', { ascending: false })
    .limit(100);

  let researchDiffsTableMissing = false;
  let researchDiffRows: MonthlyJudgmentReviewSources['researchDiffs']['rows'] = [];
  if (researchDiffsRes.error) {
    if (isTableMissing(researchDiffsRes.error.message, 'research_report_diffs')) {
      researchDiffsTableMissing = true;
    }
  } else {
    researchDiffRows = ((researchDiffsRes.data ?? []) as MonthlyJudgmentReviewSources['researchDiffs']['rows']).filter(
      (r) => inWindow(r.created_at, window),
    );
  }

  const sectorRes = await supabase
    .from('sector_radar_runs')
    .select('id,run_date,generated_at')
    .eq('user_key', userKey)
    .gte('run_date', window.startDate)
    .lte('run_date', window.endDate)
    .order('generated_at', { ascending: false })
    .limit(50);

  let sectorTableMissing = false;
  let sectorRows: MonthlyJudgmentReviewSources['sectorRadarRuns']['rows'] = [];
  if (sectorRes.error) {
    if (isTableMissing(sectorRes.error.message, 'sector_radar_runs')) {
      sectorTableMissing = true;
    }
  } else {
    sectorRows = (sectorRes.data ?? []) as MonthlyJudgmentReviewSources['sectorRadarRuns']['rows'];
  }

  const watchRes = await supabase
    .from('watchlist_recommendation_candidates')
    .select('symbol,approval_status,created_at')
    .eq('user_key', userKey)
    .gte('created_at', `${window.startDate}T00:00:00.000Z`)
    .order('created_at', { ascending: false })
    .limit(100);

  let watchTableMissing = false;
  let watchRows: MonthlyJudgmentReviewSources['watchlistRecommendations']['rows'] = [];
  if (watchRes.error) {
    if (isTableMissing(watchRes.error.message, 'watchlist_recommendation_candidates')) {
      watchTableMissing = true;
    }
  } else {
    watchRows = ((watchRes.data ?? []) as MonthlyJudgmentReviewSources['watchlistRecommendations']['rows']).filter(
      (r) => inWindow(r.created_at, window),
    );
  }

  const notesRes = await supabase
    .from('web_daily_review_notes')
    .select('id,review_date,subject_type,symbol,name,note_summary,status,created_at')
    .eq('user_key', userKey)
    .gte('review_date', window.startDate)
    .lte('review_date', window.endDate)
    .eq('status', 'saved')
    .order('review_date', { ascending: false })
    .limit(500);

  let dailyNotesTableMissing = false;
  let dailyNotesRows: MonthlyJudgmentReviewSources['dailyReviewNotes']['rows'] = [];
  if (notesRes.error) {
    if (isTableMissing(notesRes.error.message, 'web_daily_review_notes')) {
      dailyNotesTableMissing = true;
    }
  } else {
    dailyNotesRows = (notesRes.data ?? []) as MonthlyJudgmentReviewSources['dailyReviewNotes']['rows'];
  }

  return {
    window,
    impressions: { rows: impressionRows, tableMissing: impressionsTableMissing },
    feedback: { rows: feedbackRows, tableMissing: feedbackTableMissing },
    actionItems: { rows: actionItemRows, tableMissing: actionItemsTableMissing },
    tradeJournal: { rows: tradeJournalRows, tableMissing: tradeJournalTableMissing },
    retrospectives: { rows: retroRows, tableMissing: retrospectivesTableMissing },
    researchRuns: { rows: researchRunRows, tableMissing: researchRunsTableMissing },
    researchDiffs: { rows: researchDiffRows, tableMissing: researchDiffsTableMissing },
    sectorRadarRuns: { rows: sectorRows, tableMissing: sectorTableMissing },
    watchlistRecommendations: { rows: watchRows, tableMissing: watchTableMissing },
    dailyReviewNotes: { rows: dailyNotesRows, tableMissing: dailyNotesTableMissing },
  };
}
