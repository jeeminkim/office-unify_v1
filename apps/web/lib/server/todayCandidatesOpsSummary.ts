import type { UsKrEmptyReasonHistogram } from '@office-unify/shared-types';
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
  /** 최근 구간 `us_signal_candidates_empty` ops의 버킷별 가중 집계(구버전·누락은 unknown). `qualityMeta.todayCandidates.usKrEmptyReasonHistogram.items`와 동일 데이터. */
  usKrEmptyReasonHistogram: Array<{ reason: string; count: number; lastSeenAt?: string }>;
  /** EVO-006: read-only 집계 메타(히스토그램). */
  qualityMeta?: {
    todayCandidates?: {
      readOnlySummary?: true;
      usKrEmptyReasonHistogram: UsKrEmptyReasonHistogram;
    };
  };
  warnings: string[];
}

/** `detail.primaryReason` 우선, 없으면 `detail.reasonCodes[0]`, 없으면 unknown. */
export function resolveUsKrEmptyHistogramBucketReason(detail: unknown): string {
  if (!detail || typeof detail !== 'object') return 'unknown';
  const d = detail as Record<string, unknown>;
  const pr = d.primaryReason;
  if (typeof pr === 'string' && pr.trim()) return pr.trim();
  const rc = d.reasonCodes;
  if (Array.isArray(rc) && rc.length > 0) {
    const first = rc[0];
    if (typeof first === 'string' && first.trim()) return first.trim();
  }
  return 'unknown';
}

function maxIso(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

export function summarizeTodayCandidateOps(rows: WebOpsEventRow[], windowDays: number): TodayCandidatesOpsSummaryResponse {
  const now = new Date();
  const from = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
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

  const emptyReasonHist = new Map<string, { count: number; lastSeenAt?: string }>();
  for (const row of inRange) {
    if (row.code !== 'us_signal_candidates_empty') continue;
    const reason = resolveUsKrEmptyHistogramBucketReason(row.detail);
    const n = Number(row.occurrence_count ?? 1);
    if (!Number.isFinite(n) || n < 0) continue;
    const prev = emptyReasonHist.get(reason) ?? { count: 0, lastSeenAt: undefined };
    emptyReasonHist.set(reason, {
      count: prev.count + n,
      lastSeenAt: maxIso(prev.lastSeenAt, row.last_seen_at),
    });
  }

  const histogramRange: UsKrEmptyReasonHistogram['range'] = windowDays <= 1 ? '24h' : '7d';
  const usKrEmptyReasonHistogram = [...emptyReasonHist.entries()]
    .map(([reason, v]) => ({
      reason,
      count: v.count,
      ...(v.lastSeenAt ? { lastSeenAt: v.lastSeenAt } : {}),
    }))
    .sort((a, b) => b.count - a.count);

  const emptyWeightedTotal = usKrEmptyReasonHistogram.reduce((acc, x) => acc + x.count, 0);

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
      days: windowDays,
      from: from.toISOString(),
      to: now.toISOString(),
    },
    totals,
    topCandidates,
    usKrEmptyReasonHistogram,
    qualityMeta: {
      todayCandidates: {
        readOnlySummary: true,
        usKrEmptyReasonHistogram: {
          range: histogramRange,
          totalCount: emptyWeightedTotal,
          items: usKrEmptyReasonHistogram,
        },
      },
    },
    warnings: [],
  };
}
