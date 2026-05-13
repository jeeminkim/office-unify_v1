import 'server-only';

import type { CandidateReadStatus, CandidateSheetParsedRow } from '@/lib/server/googleFinanceTickerCandidateSheet';
import { buildTickerResolverDtos, type TickerResolverQuoteContext, type TickerResolverRowDto } from '@/lib/server/tickerResolverRecommendations';

export type TickerResolverRequestLifecycleStatus =
  | 'pending'
  | 'ready'
  | 'partial'
  | 'timeout'
  | 'failed'
  | 'stale';

export type TickerResolverRowStatusDto = CandidateReadStatus | 'timeout';

export type TickerResolverStatusRowDto = Omit<TickerResolverRowDto, 'status'> & { status: TickerResolverRowStatusDto };

function parseSheetTime(iso?: string): number | null {
  if (!iso?.trim()) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function remapRowStatus(status: CandidateReadStatus, timedOut: boolean): TickerResolverRowStatusDto {
  if (status === 'pending' && timedOut) return 'timeout';
  return status;
}

export function buildTickerResolverStatusPayload(input: {
  requestId: string;
  parsed: CandidateSheetParsedRow[];
  quoteContextByKey?: Map<string, TickerResolverQuoteContext>;
}): {
  requestId: string;
  startedAt: string | null;
  lastCheckedAt: string;
  elapsedMs: number;
  timeoutMs: number;
  status: TickerResolverRequestLifecycleStatus;
  rows: TickerResolverStatusRowDto[];
  recommendations: ReturnType<typeof buildTickerResolverDtos>['recommendations'];
  summary: {
    totalSymbols: number;
    autoApplicableCount: number;
    manualRequiredCount: number;
    defaultApplicableCount: number;
    pendingCandidateCount: number;
    readyCandidateCount: number;
    timeoutCandidateCount: number;
    failedCandidateCount: number;
  };
  qualityMeta: {
    tickerResolver: {
      status: TickerResolverRequestLifecycleStatus;
      elapsedMs: number;
      timeoutMs: number;
      pendingCandidateCount: number;
      readyCandidateCount: number;
      timeoutCandidateCount: number;
      failedCandidateCount: number;
    };
  };
} {
  const timeoutMs = Math.max(10_000, Number(process.env.TICKER_RESOLVER_TIMEOUT_MS ?? 120_000) || 120_000);
  const times = input.parsed.map((p) => parseSheetTime(p.createdAt)).filter((t): t is number => t != null);
  const startedAtMs = times.length ? Math.min(...times) : null;
  const lastCheckedAt = new Date().toISOString();
  const startedAt = startedAtMs != null ? new Date(startedAtMs).toISOString() : null;
  const elapsedMs = startedAtMs != null ? Math.max(0, Date.now() - startedAtMs) : 0;
  const timedOut = elapsedMs >= timeoutMs;

  const built = buildTickerResolverDtos(input.parsed, { quoteContextByKey: input.quoteContextByKey });
  const rows: TickerResolverStatusRowDto[] = built.rows.map((r) => ({
    ...r,
    status: remapRowStatus(r.status, timedOut),
  }));

  let pending = 0;
  let ready = 0;
  let timeout = 0;
  let failed = 0;
  for (const r of rows) {
    if (r.status === 'pending') pending += 1;
    else if (r.status === 'timeout') timeout += 1;
    else if (r.status === 'ok') ready += 1;
    else if (r.status === 'mismatch' || r.status === 'parse_failed') failed += 1;
  }

  let lifecycle: TickerResolverRequestLifecycleStatus;
  if (rows.length === 0) {
    lifecycle = 'failed';
  } else if (pending > 0 && !timedOut) {
    lifecycle = 'pending';
  } else if (pending > 0 && timedOut) {
    lifecycle = timeout > 0 && ready > 0 ? 'partial' : 'timeout';
  } else if (ready === rows.length) {
    lifecycle = 'ready';
  } else if (ready > 0) {
    lifecycle = 'partial';
  } else if (failed === rows.length) {
    lifecycle = 'failed';
  } else {
    lifecycle = 'stale';
  }

  const recommendations = built.recommendations.map((rec) => {
    const groupRows = rows.filter(
      (r) => r.targetType === rec.targetType && r.market === rec.market && r.symbol === rec.symbol,
    );
    const anyTimeout = groupRows.some((r) => r.status === 'timeout');
    const anyOk = groupRows.some((r) => r.status === 'ok');
    const blocked = anyTimeout && !anyOk;
    if (!blocked) return rec;
    return {
      ...rec,
      applyState: {
        ...rec.applyState,
        autoApplicable: false,
        manualRequired: true,
        reason: `${rec.applyState.reason} (시트 계산이 제한 시간 내 끝나지 않아 timeout 상태입니다. 수동 입력 또는 재요청을 사용하세요.)`,
      },
    };
  });

  const summary = {
    totalSymbols: recommendations.length,
    autoApplicableCount: recommendations.filter((r) => r.applyState.autoApplicable && r.recommendedGoogleTicker).length,
    manualRequiredCount: recommendations.filter((r) => r.applyState.manualRequired).length,
    defaultApplicableCount: recommendations.filter((r) => r.canApplyDefaultBeforeVerification).length,
    pendingCandidateCount: pending,
    readyCandidateCount: ready,
    timeoutCandidateCount: timeout,
    failedCandidateCount: failed,
  };

  return {
    requestId: input.requestId,
    startedAt,
    lastCheckedAt,
    elapsedMs,
    timeoutMs,
    status: lifecycle,
    rows,
    recommendations,
    summary,
    qualityMeta: {
      tickerResolver: {
        status: lifecycle,
        elapsedMs,
        timeoutMs,
        pendingCandidateCount: pending,
        readyCandidateCount: ready,
        timeoutCandidateCount: timeout,
        failedCandidateCount: failed,
      },
    },
  };
}
