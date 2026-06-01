import 'server-only';

import type {
  GoogleFinanceAnchorSummaryForGating,
  UsCandidateDiagnostics,
  UsCandidateGoogleFinanceGatingReason,
} from '@office-unify/shared-types';
import type { TodayStockCandidate, UsMarketMorningSummary } from '@/lib/todayCandidatesContract';
import { buildUsSetupDiagnosis } from '@/lib/server/usSetupDiagnosis';
import { normalizeGoogleFinanceAnchorSummary } from '@/lib/server/googleFinanceAnchorSummaryNormalizer';
import { buildGoogleFinanceProviderCapability } from '@/lib/server/quotePipelineDiagnostics';
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

export function deriveUsCandidateGatingReason(input: {
  sheetsAnchorOk: number;
  usMarketSummaryStatus: UsCandidateDiagnostics['usMarketSummaryStatus'];
  usMarketAvailable: boolean;
  usSignalCount: number;
  selectedUsCount: number;
  poolUsCount: number;
  quoteMissingCount: number;
  fetchFailed: boolean;
}): UsCandidateGoogleFinanceGatingReason | undefined {
  const { sheetsAnchorOk, usMarketSummaryStatus, usMarketAvailable, usSignalCount, selectedUsCount, poolUsCount, quoteMissingCount, fetchFailed } =
    input;

  if (sheetsAnchorOk === 0) {
    if (fetchFailed || usMarketSummaryStatus === 'failed') return 'quote_provider_failed';
    return 'sheets_anchor_zero';
  }

  if (sheetsAnchorOk > 0 && selectedUsCount === 0 && poolUsCount === 0) {
    if (!usMarketAvailable || usSignalCount === 0) return 'sheets_anchor_ok_but_us_signal_empty';
    return 'gating_not_connected';
  }

  if (sheetsAnchorOk > 0 && quoteMissingCount > 0 && selectedUsCount === 0) {
    return 'us_signal_mapping_empty';
  }

  if (sheetsAnchorOk > 0 && usMarketSummaryStatus === 'degraded' && selectedUsCount === 0) {
    return 'gating_not_connected';
  }

  return undefined;
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
  /** additive: latest Google Finance setup read-back snapshot */
  googleFinanceAnchorSummary?: GoogleFinanceAnchorSummaryForGating;
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

  const anchorRequested = diag?.anchorSymbolsRequested ?? input.seedSymbolCount ?? 0;
  const normalizedAnchor = normalizeGoogleFinanceAnchorSummary({
    sheetsAnchorOk: input.googleFinanceAnchorSummary?.sheetsAnchorOk,
    anchorMatched: input.googleFinanceAnchorSummary?.anchorMatched,
    requestedAnchorCount: anchorRequested,
    receivedAnchorCount: diag?.yahooQuoteResultCount,
  });
  const anchorOk = normalizedAnchor.anchorOkCount;

  const sheetsAnchorOk = normalizedAnchor.anchorOkCount;

  const gatingReason = deriveUsCandidateGatingReason({
    sheetsAnchorOk,
    usMarketSummaryStatus,
    usMarketAvailable: input.usMarketSummary.available,
    usSignalCount: input.usMarketSummary.signals?.length ?? 0,
    selectedUsCount: selectedUs.length,
    poolUsCount: poolUs.length,
    quoteMissingCount: quoteMissing,
    fetchFailed: Boolean(diag?.fetchFailed),
  });

  const effectiveGatingReason =
    input.googleFinanceAnchorSummary &&
    normalizedAnchor.isAnchorOk &&
    gatingReason === 'sheets_anchor_zero'
      ? 'gating_not_connected'
      : gatingReason;

  const remediationSteps: UsCandidateDiagnostics['remediationSteps'] =
    normalizedAnchor.isAnchorOk && effectiveGatingReason === 'us_signal_mapping_empty'
      ? [
          {
            key: 'us_mapping_diagnosis',
            label: 'US mapping 진단 보기',
            description:
              '미국장 신호는 있으나 한국/관심 후보로 연결되지 않았습니다. Google Finance 문제가 아닙니다.',
            href: '/sector-radar',
            actionType: 'navigate',
          },
          {
            key: 'watchlist_theme_check',
            label: '관심종목 섹터/테마 점검',
            description: 'US→KR 테마 매핑 규칙 또는 관심종목 sector/theme 태그를 점검하세요.',
            href: '/watchlist',
            actionType: 'navigate',
          },
          {
            key: 'quote_quality_check',
            label: '시세 품질 다시 확인',
            description: '시세 품질이 낮으면 후보 우선순위에서 밀릴 수 있습니다.',
            href: '/portfolio',
            actionType: 'refresh_quotes',
          },
        ]
      : [
    {
      key: 'check_anchor',
      label: '미국 anchor 시세 상태 확인',
      description: `요청 anchor ${anchorRequested}건 · 확인 ${anchorOk}건. SPY/QQQ/SMH 등 시트·시세 탭을 확인하세요.`,
      href: '/system-status',
      actionType: 'navigate',
    },
    {
      key: 'refresh_quotes',
      label: '시세 새로고침',
      description: 'Portfolio 시세 refresh 후 Today Brief를 다시 불러옵니다.',
      href: '/portfolio',
      actionType: 'refresh_quotes',
    },
    {
      key: 'ticker_resolver',
      label: 'ticker 매핑 확인',
      description: '미국 관심종목의 google_ticker·quote_symbol 형식을 확인합니다.',
      href: '/portfolio-ledger',
      actionType: 'navigate',
    },
    {
      key: 'us_data_check_cards',
      label: '미국 데이터 점검 카드 보기',
      description: '일반 관찰 후보가 아닌 점검 카드로 분리된 종목을 확인합니다.',
      actionType: 'navigate',
    },
    {
      key: 'focus_kr_sector',
      label: '오늘은 국내·섹터 후보 중심',
      description: '미국 데이터가 부족할 때는 국내·섹터 관찰 후보를 우선 점검합니다.',
      actionType: 'navigate',
    },
  ];

  const base: UsCandidateDiagnostics = {
    status,
    remediationSteps,
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
    googleFinanceAnchorOk: normalizedAnchor.isAnchorOk,
    actualUsQuoteRowsOk: quoteOk,
    actualKrQuoteRowsOk: input.pool.filter((c) => c.country === 'KR' && c.dataQuality?.quoteReady !== false).length,
    providerCapability: buildGoogleFinanceProviderCapability(),
    quoteUsabilityStatus:
      quoteMissing > 0 && quoteOk === 0
        ? 'failed'
        : quoteMissing > 0
          ? 'partial'
          : 'ok',
    suppressReasons: topSuppressReasons,
    nextFix: [
      ...(quoteMissing > 0 ? (['quote_refresh', 'ticker_mapping'] as const) : []),
      ...(effectiveGatingReason === 'us_signal_mapping_empty'
        ? (['watchlist_theme_mapping', 'sector_radar_mapping'] as const)
        : []),
      ...(suppressedUs > 0 ? (['candidate_queue_policy'] as const) : []),
    ],
    googleFinanceAnchorSummary: input.googleFinanceAnchorSummary
      ? { ...input.googleFinanceAnchorSummary, gatingReason: effectiveGatingReason }
      : effectiveGatingReason
        ? {
            sheetsAnchorOk,
            anchorMatched: sheetsAnchorOk,
            quoteSource: sheetsAnchorOk > 0 ? 'google_sheets_readback' : 'yahoo_fallback',
            gatingReason: effectiveGatingReason,
          }
        : undefined,
    gatingReason: effectiveGatingReason,
  };

  if (
    input.googleFinanceAnchorSummary &&
    normalizedAnchor.isAnchorOk &&
    effectiveGatingReason === 'gating_not_connected'
  ) {
    base.actionHint =
      'Google Finance anchor는 정상입니다. Today Candidate에는 실제 종목 quote quality, mapping, queue policy가 추가로 반영됩니다. 시세 상태 확인 후 Today Brief를 다시 실행하세요.';
  }

  if (normalizedAnchor.isAnchorOk && effectiveGatingReason === 'us_signal_mapping_empty') {
    base.actionHint =
      'Google Finance anchor는 정상입니다. 미국 신호가 국내/관심 후보로 연결되지 않았으므로 US→KR theme mapping, Watchlist sector/theme, quote quality를 확인하세요.';
  }

  if (status !== 'ok' || (!normalizedAnchor.isAnchorOk && anchorOk < anchorRequested)) {
    base.setupDiagnosis = buildUsSetupDiagnosis({
      usMarketSummary: input.usMarketSummary,
      diagnostics: base,
    });
  }

  return base;
}
