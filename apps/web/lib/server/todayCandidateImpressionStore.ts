import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TodayCandidateExposureDiagnostics } from '@office-unify/shared-types';
import type { TodayStockCandidate } from '@/lib/todayCandidatesContract';

const TABLE = 'today_candidate_impressions';

function ymdKst(d = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function isTableMissingError(msg: string): boolean {
  return msg.includes('today_candidate_impressions') || msg.includes('does not exist') || msg.includes('schema cache');
}

export async function saveTodayCandidateImpressions(params: {
  supabase: SupabaseClient;
  userKey: string;
  requestId?: string;
  candidates: TodayStockCandidate[];
  qualityMeta?: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<{ saved: boolean; count: number; errorCode?: string }> {
  const { supabase, userKey, candidates } = params;
  if (candidates.length === 0) return { saved: false, count: 0 };

  const runDate = ymdKst();
  const rows = candidates.map((c, idx) => {
    const trace = c.decisionTrace;
    const isUs = c.country === 'US' || c.market === 'US' || c.source === 'us_market_morning';
    return {
      user_key: userKey,
      request_id: params.requestId ?? null,
      run_date: runDate,
      source_route: 'today-brief',
      symbol: c.stockCode ?? c.symbol ?? null,
      name: c.name,
      market: c.market,
      candidate_bucket: trace?.candidateBucket ?? c.source,
      decision_status: trace?.decisionStatus ?? 'selected',
      score: c.score,
      judgment_quality_level: c.judgmentQuality?.level ?? null,
      is_user_watchlist: Boolean(c.alreadyInWatchlist),
      is_user_holding: trace?.candidateBucket === 'holding',
      is_us_candidate: isUs,
      is_sector_radar_candidate: c.source === 'sector_radar',
      is_corporate_action_risk: Boolean(c.corporateActionRisk?.active),
      selected_rank: idx + 1,
      selected_reasons: trace?.selectedReasons ?? [],
      suppressed_reasons: trace?.suppressedReasons ?? [],
      rejected_reasons: trace?.rejectedReasons ?? [],
      missing_evidence: trace?.missingEvidence ?? [],
      decision_trace: trace ?? {},
      quality_meta: params.qualityMeta ?? {},
      idempotency_key: params.idempotencyKey ? `${params.idempotencyKey}:${c.candidateId}` : null,
    };
  });

  try {
    const { error } = await supabase.from(TABLE).insert(rows);
    if (error) {
      if (isTableMissingError(error.message)) {
        return { saved: false, count: 0, errorCode: 'today_candidate_impressions_table_missing' };
      }
      console.warn('[today_candidate_impressions] insert failed', error.message);
      return { saved: false, count: 0, errorCode: 'insert_failed' };
    }
    return { saved: true, count: rows.length };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isTableMissingError(msg)) {
      return { saved: false, count: 0, errorCode: 'today_candidate_impressions_table_missing' };
    }
    console.warn('[today_candidate_impressions] insert exception', msg);
    return { saved: false, count: 0, errorCode: 'insert_failed' };
  }
}

export async function fetchTodayCandidateExposureStats(params: {
  supabase: SupabaseClient;
  userKey: string;
  days?: number;
}): Promise<{
  rows: Array<{
    symbol: string | null;
    name: string | null;
    run_date: string;
    is_user_watchlist: boolean;
    is_us_candidate: boolean;
    is_sector_radar_candidate: boolean;
    generated_at: string;
  }>;
  tableMissing: boolean;
}> {
  const days = Math.max(1, Math.min(30, params.days ?? 7));
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().slice(0, 10);

  try {
    const { data, error } = await params.supabase
      .from(TABLE)
      .select('symbol,name,run_date,is_user_watchlist,is_us_candidate,is_sector_radar_candidate,generated_at')
      .eq('user_key', params.userKey)
      .gte('run_date', sinceIso)
      .order('run_date', { ascending: false })
      .limit(500);

    if (error) {
      if (isTableMissingError(error.message)) {
        return { rows: [], tableMissing: true };
      }
      return { rows: [], tableMissing: false };
    }
    type Row = {
      symbol: string | null;
      name: string | null;
      run_date: string;
      is_user_watchlist: boolean;
      is_us_candidate: boolean;
      is_sector_radar_candidate: boolean;
      generated_at: string;
    };
    return { rows: (data ?? []) as Row[], tableMissing: false };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isTableMissingError(msg)) return { rows: [], tableMissing: true };
    return { rows: [], tableMissing: false };
  }
}

export function buildExposureDiagnosticsFromRows(
  rows: Awaited<ReturnType<typeof fetchTodayCandidateExposureStats>>['rows'],
  windowDays: number,
  tableMissing: boolean,
  feedback?: import('@office-unify/shared-types').TodayCandidateExposureFeedbackDiagnostics,
): TodayCandidateExposureDiagnostics {
  if (tableMissing) {
    return {
      windowDays,
      selectedCount: 0,
      watchlistSelectedCount: 0,
      watchlistDominanceRatio: 0,
      usSelectedCount: 0,
      sectorRadarSelectedCount: 0,
      repeatedSymbols: [],
      warningCodes: [],
      tableMissing: true,
      actionHint: 'docs/sql/append_today_candidate_impressions.sql 적용 후 7일 노출 진단을 사용할 수 있습니다.',
    };
  }

  const selectedCount = rows.length;
  const watchlistSelectedCount = rows.filter((r) => r.is_user_watchlist).length;
  const usSelectedCount = rows.filter((r) => r.is_us_candidate).length;
  const sectorRadarSelectedCount = rows.filter((r) => r.is_sector_radar_candidate).length;
  const watchlistDominanceRatio = selectedCount > 0 ? watchlistSelectedCount / selectedCount : 0;

  const bySymbol = new Map<string, { name: string; count: number; lastSeenAt: string }>();
  for (const r of rows) {
    const sym = (r.symbol ?? '').trim();
    if (!sym) continue;
    const prev = bySymbol.get(sym);
    const at = String(r.generated_at ?? r.run_date);
    if (!prev) {
      bySymbol.set(sym, { name: r.name ?? sym, count: 1, lastSeenAt: at });
    } else {
      prev.count += 1;
      if (at > prev.lastSeenAt) prev.lastSeenAt = at;
    }
  }
  const repeatedSymbols = [...bySymbol.entries()]
    .filter(([, v]) => v.count >= 2)
    .map(([symbol, v]) => ({ symbol, name: v.name, count: v.count, lastSeenAt: v.lastSeenAt }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const warningCodes: string[] = [];
  if (watchlistDominanceRatio >= 0.7 && selectedCount >= 3) {
    warningCodes.push('watchlist_dominance_high');
  }
  if (repeatedSymbols.some((s) => s.count >= 3)) {
    warningCodes.push('repeat_exposure_high');
  }
  if (usSelectedCount === 0 && selectedCount >= 3) {
    warningCodes.push('us_candidate_absent_7d');
  }
  if (feedback && feedback.hide7dActiveCount > 0) {
    warningCodes.push('user_hidden_7d_active');
  }

  let actionHint: string | undefined;
  if (warningCodes.includes('watchlist_dominance_high')) {
    actionHint = '최근 7일 후보의 상당 부분이 등록한 관심종목입니다. 데이터 품질 점검용 참고만 하세요.';
  } else if (warningCodes.includes('us_candidate_absent_7d')) {
    actionHint = '최근 7일간 미국 관찰 후보가 덱에 포함되지 않았습니다. 미국 후보 진단을 확인하세요.';
  }

  return {
    windowDays,
    selectedCount,
    watchlistSelectedCount,
    watchlistDominanceRatio: Math.round(watchlistDominanceRatio * 100) / 100,
    usSelectedCount,
    sectorRadarSelectedCount,
    repeatedSymbols,
    warningCodes,
    actionHint,
    ...(feedback ? { feedback } : {}),
  };
}
