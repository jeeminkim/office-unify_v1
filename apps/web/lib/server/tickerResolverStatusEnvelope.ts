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

export type TickerResolverStatusRowDto = Omit<TickerResolverRowDto, 'status'> & {
  status: TickerResolverRowStatusDto;
  /** 행 단위 적용 불가 사유(additive) */
  applyDisabledReason?: string;
};

function parseSheetTime(iso?: string): number | null {
  if (!iso?.trim()) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function remapRowStatus(status: CandidateReadStatus, timedOut: boolean): TickerResolverRowStatusDto {
  if (status === 'pending' && timedOut) return 'timeout';
  return status;
}

function candidateApplyDisabledReason(
  status: TickerResolverRowStatusDto,
  timedOut: boolean,
): string | undefined {
  if (status === 'ok') return undefined;
  if (status === 'timeout' || (status === 'pending' && timedOut)) {
    return '시트 계산 제한 시간 초과(timeout)로 적용할 수 없습니다.';
  }
  if (status === 'pending') return 'Sheets 계산 대기 중에는 적용할 수 없습니다.';
  if (status === 'mismatch' || status === 'parse_failed') return 'GOOGLEFINANCE 검증 실패로 적용할 수 없습니다.';
  if (status === 'empty') return '시트 값이 비어 적용할 수 없습니다.';
  return undefined;
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
  const rows: TickerResolverStatusRowDto[] = built.rows.map((r) => {
    const status = remapRowStatus(r.status, timedOut);
    return {
      ...r,
      status,
      applyDisabledReason: candidateApplyDisabledReason(status, timedOut),
    };
  });

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
  } else if (timedOut && timeout > 0 && ready > 0) {
    lifecycle = 'partial';
  } else if (timedOut && timeout > 0 && ready === 0) {
    lifecycle = 'timeout';
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
    const anyOk = groupRows.some((r) => r.status === 'ok');
    const anyPendingLive = groupRows.some((r) => r.status === 'pending' && !timedOut);

    const syncedCandidates = rec.candidates.map((c) => {
      const row = groupRows.find(
        (r) => r.candidateTicker.trim().toUpperCase() === c.ticker.trim().toUpperCase(),
      );
      const status = (row?.status ?? c.status) as TickerResolverRowStatusDto;
      return {
        ...c,
        status,
        applyDisabledReason: candidateApplyDisabledReason(status, timedOut),
      };
    });

    let applyState = { ...rec.applyState };
    if (timedOut && !anyOk && groupRows.length > 0) {
      applyState = {
        ...applyState,
        autoApplicable: false,
        manualRequired: true,
        reason: `${applyState.reason} (시트 계산이 제한 시간 내 끝나지 않아 timeout 상태입니다. 수동 입력 또는 재요청을 사용하세요.)`,
      };
    } else if (timedOut && anyOk && groupRows.some((r) => r.status === 'timeout' || r.status === 'empty')) {
      applyState = {
        ...applyState,
        autoApplicable: false,
        manualRequired: true,
        reason: `${applyState.reason} (일부 후보만 검증 완료(ok). ok 상태 후보만 적용 가능합니다.)`,
      };
    } else if (!timedOut && anyPendingLive) {
      applyState = {
        ...applyState,
        autoApplicable: false,
        reason: `${applyState.reason} (Sheets 계산 대기 중입니다. 제한 시간 내에는 ok 후보만 적용 가능합니다.)`,
      };
    }

    return {
      ...rec,
      candidates: syncedCandidates,
      applyState,
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
