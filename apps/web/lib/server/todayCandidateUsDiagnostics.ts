import 'server-only';

import type { UsCandidateDiagnostics } from '@office-unify/shared-types';
import type { TodayStockCandidate, UsMarketMorningSummary } from '@/lib/todayCandidatesContract';
import type { CandidateDecisionTrace } from '@office-unify/shared-types';

function countReasons(traces: CandidateDecisionTrace[], field: 'rejectedReasons' | 'suppressedReasons'): string[] {
  const counts = new Map<string, number>();
  for (const t of traces) {
    const arr = field === 'rejectedReasons' ? t.rejectedReasons : t.suppressedReasons;
    for (const r of arr) {
      const code = r.code ?? 'unknown';
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([code]) => code);
}

function isUsPoolCandidate(c: TodayStockCandidate): boolean {
  return c.country === 'US' || c.market === 'US' || c.source === 'us_market_morning';
}

function isUsDirect(c: TodayStockCandidate): boolean {
  return c.country === 'US' && c.source !== 'us_market_morning';
}

function isUsDataCheckCard(c: TodayStockCandidate): boolean {
  return (
    c.displayMetrics?.candidateCardKind === 'us_data_check' ||
    c.briefDeckSlot === 'us_market_check' ||
    c.displayMetrics?.dataStatusUi === 'us_data_missing'
  );
}

export function buildUsCandidateDiagnostics(input: {
  usMarketSummary: UsMarketMorningSummary;
  userUsWatchlistCount: number;
  userUsHoldingCount: number;
  pool: TodayStockCandidate[];
  usDirectCandidates: TodayStockCandidate[];
  usKrMappedCandidates: TodayStockCandidate[];
  selectedDeck: TodayStockCandidate[];
  suppressedTraces?: CandidateDecisionTrace[];
  rejectedTraces?: CandidateDecisionTrace[];
  seedSymbolCount?: number;
}): UsCandidateDiagnostics {
  const diag = input.usMarketSummary.diagnostics;
  const quoteOk = input.pool.filter((c) => c.dataQuality?.quoteReady !== false).length;
  const quoteMissing = input.pool.filter((c) => c.dataQuality?.quoteReady === false).length;

  const selectedUs = input.selectedDeck.filter((c) => isUsPoolCandidate(c) && !isUsDataCheckCard(c));
  const selectedUsDirect = input.selectedDeck.filter((c) => isUsDirect(c) && !isUsDataCheckCard(c));
  const selectedUsKr = input.selectedDeck.filter((c) => c.source === 'us_market_morning');

  const suppressedUs = (input.suppressedTraces ?? []).filter(
    (t) => t.candidateBucket === 'us_signal' || t.market === 'US',
  ).length;
  const rejectedUs = (input.rejectedTraces ?? []).filter(
    (t) => t.candidateBucket === 'us_signal' || t.market === 'US',
  ).length;

  const poolUs = input.pool.filter(isUsPoolCandidate);
  const usMarketSummaryStatus: UsCandidateDiagnostics['usMarketSummaryStatus'] = !input.usMarketSummary.available
    ? 'empty'
    : diag?.fetchFailed
      ? 'failed'
      : diag?.coverageStatus === 'degraded'
        ? 'degraded'
        : 'ok';

  let status: UsCandidateDiagnostics['status'] = 'ok';
  if (input.userUsWatchlistCount > 0 && selectedUs.length === 0 && poolUs.length === 0) {
    status = 'empty';
  } else if (usMarketSummaryStatus === 'degraded' || usMarketSummaryStatus === 'failed') {
    status = 'degraded';
  } else if (selectedUs.length === 0 && (input.userUsWatchlistCount > 0 || input.usKrMappedCandidates.length > 0)) {
    status = 'degraded';
  }

  const topRejectReasons = countReasons(input.rejectedTraces ?? [], 'rejectedReasons');
  const topSuppressReasons = countReasons(input.suppressedTraces ?? [], 'suppressedReasons');

  let actionHint: string | undefined;
  if (status === 'empty' && input.userUsWatchlistCount > 0) {
    actionHint =
      '미국 관심종목이 있으나 오늘 관찰 덱에 미국 후보가 없습니다. 시세·매핑·슬롯 제한 사유를 확인하세요.';
  } else if (poolUs.length > 0 && selectedUs.length === 0) {
    actionHint =
      '미국 후보 풀에는 종목이 있으나 일반 관찰 덱에는 포함되지 않았습니다. 데이터 부족 시 미국 데이터 점검 카드로 분리됩니다.';
  } else if (quoteMissing > 0 && selectedUs.length === 0) {
    actionHint = '미국 시세가 부족한 후보가 있습니다. quote_missing·stale 여부를 점검하세요.';
  }

  return {
    status,
    userUsWatchlistCount: input.userUsWatchlistCount,
    userUsHoldingCount: input.userUsHoldingCount,
    seedSymbolCount: input.seedSymbolCount ?? diag?.anchorSymbolsRequested ?? 0,
    quoteOkCount: quoteOk,
    quoteMissingCount: quoteMissing,
    quoteStaleCount: 0,
    usMarketSummaryStatus,
    poolCandidateCount: input.pool.length,
    poolUsDirectCount: input.usDirectCandidates.length,
    poolUsKrMappedCount: input.usKrMappedCandidates.length,
    selectedUsCandidateCount: selectedUs.length,
    selectedUsKrMappedCount: selectedUsKr.length,
    selectedUsDirectCount: selectedUsDirect.length,
    suppressedUsCandidateCount: suppressedUs,
    rejectedUsCandidateCount: rejectedUs,
    topRejectReasons,
    topSuppressReasons,
    slotPolicy: {
      usSlotEnabled: true,
      minUsCandidateTarget: input.userUsWatchlistCount > 0 ? 1 : 0,
      maxUsCandidateTarget: 1,
    },
    actionHint,
  };
}
