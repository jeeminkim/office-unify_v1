import type { WebOpsEventRow } from '@office-unify/supabase-access';

export interface TodayCandidatesOpsSummaryResponse {
  ok: boolean;
  range: {
    days: number;
    from: string;
    to: string;
  };
  totals: {
    events: number;
    occurrenceTotal: number;
    generated: number;
    usMarketNoData: number;
    /**미국 신호→한국 후보 empty ops 건수 */
    usSignalCandidatesEmpty: number;
    detailOpened: number;
    watchlistAdded: number;
    alreadyExists: number;
    addFailed: number;
  };
  topCandidates: Array<{
    name?: string;
    stockCode?: string;
    code: string;
    occurrenceCount: number;
    lastSeenAt?: string;
  }>;
  warnings: string[];
}

export function summarizeTodayCandidateOps(rows: WebOpsEventRow[], days: number): TodayCandidatesOpsSummaryResponse {
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const inRange = rows.filter((r) => new Date(r.last_seen_at).getTime() >= from.getTime());
  const totals = {
    events: inRange.length,
    occurrenceTotal: inRange.reduce((acc, x) => acc + Number(x.occurrence_count ?? 1), 0),
    generated: 0,
    usMarketNoData: 0,
    usSignalCandidatesEmpty: 0,
    detailOpened: 0,
    watchlistAdded: 0,
    alreadyExists: 0,
    addFailed: 0,
  };
  for (const row of inRange) {
    if (row.code === 'today_candidates_generated') totals.generated += 1;
    if (row.code === 'today_candidates_us_market_no_data') totals.usMarketNoData += 1;
    if (row.code === 'us_signal_candidates_empty') totals.usSignalCandidatesEmpty += 1;
    if (row.code === 'today_candidate_detail_opened') totals.detailOpened += 1;
    if (row.code === 'today_candidate_watchlist_add_success') totals.watchlistAdded += 1;
    if (row.code === 'today_candidate_watchlist_already_exists') totals.alreadyExists += 1;
    if (row.code === 'today_candidate_watchlist_add_failed') totals.addFailed += 1;
  }
  const topCandidates = inRange
    .map((r) => {
      const detail = (r.detail ?? {}) as Record<string, unknown>;
      return {
        name: typeof detail.name === 'string' ? detail.name : undefined,
        stockCode: typeof detail.stockCode === 'string' ? detail.stockCode : undefined,
        code: r.code ?? 'unknown',
        occurrenceCount: Number(r.occurrence_count ?? 1),
        lastSeenAt: r.last_seen_at,
      };
    })
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
    .slice(0, 10);

  return {
    ok: true,
    range: {
      days,
      from: from.toISOString(),
      to: now.toISOString(),
    },
    totals,
    topCandidates,
    warnings: [],
  };
}
