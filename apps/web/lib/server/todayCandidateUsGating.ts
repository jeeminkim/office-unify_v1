import type { GoogleFinanceAnchorSummaryForGating, TodayCandidateCardKind } from '@office-unify/shared-types';
import type { TodayStockCandidate, UsMarketMorningSummary } from '@/lib/todayCandidatesContract';
import { buildTodayCandidateDisplayMetrics } from '@/lib/server/todayBriefCandidateDisplay';
import {
  normalizeGoogleFinanceAnchorSummary,
  type GoogleFinanceAnchorSummaryNormalizerInput,
} from '@/lib/server/googleFinanceAnchorSummaryNormalizer';

export type UsMarketSummaryStatus = 'ok' | 'degraded_usable' | 'empty' | 'failed' | 'unknown';

export type UsCandidateGateTier = 'primary_deck' | 'diagnostic_only' | 'holding_check_only';

type UsAnchorSummaryContext = GoogleFinanceAnchorSummaryForGating & GoogleFinanceAnchorSummaryNormalizerInput;

const DIAGNOSTIC_COPY = {
  headline: '미국 데이터 점검용 카드입니다.',
  body: '미국 시장 데이터가 부족해 일반 관찰 후보로 사용하지 않았습니다.',
  follow: '시세·시장 요약이 정상화되면 다시 관찰 후보로 평가됩니다.',
} as const;

function buildUsAnchorReadbackDetail(
  summary: UsMarketMorningSummary,
  googleFinanceAnchorSummary?: UsAnchorSummaryContext,
): string {
  const normalized = normalizeGoogleFinanceAnchorSummary({
    sheetsAnchorOk: googleFinanceAnchorSummary?.sheetsAnchorOk,
    anchorOk: googleFinanceAnchorSummary?.anchorOk,
    anchorMatched: googleFinanceAnchorSummary?.anchorMatched,
    sheetsAnchorMatched: googleFinanceAnchorSummary?.sheetsAnchorMatched,
    missingAnchors: googleFinanceAnchorSummary?.missingAnchors,
    missingAnchorSymbols: googleFinanceAnchorSummary?.missingAnchorSymbols,
    fallbackOnly: googleFinanceAnchorSummary?.fallbackOnly,
    requestedAnchorCount: summary.diagnostics?.anchorSymbolsRequested,
    receivedAnchorCount: summary.diagnostics?.yahooQuoteResultCount,
  });

  if (normalized.isAnchorOk) {
    return `Google Finance anchor 정상: ${normalized.anchorOkCount}건 확인`;
  }

  if (normalized.isFormulaPending) {
    return `Google Finance anchor 행 ${normalized.anchorMatchedCount}건 매칭 · 수식 계산 대기`;
  }

  const ok = summary.diagnostics?.yahooQuoteResultCount ?? normalized.anchorOkCount;
  const req = summary.diagnostics?.anchorSymbolsRequested ?? 0;
  return `미국 시장 anchor: ${ok}/${req} 확인`;
}

export function resolveUsMarketSummaryStatus(summary: UsMarketMorningSummary): UsMarketSummaryStatus {
  const diag = summary.diagnostics;
  if (diag?.fetchFailed) {
    return 'failed';
  }
  if (!summary.available || (diag?.yahooQuoteResultCount ?? 0) === 0) {
    return 'empty';
  }
  const requested = diag?.anchorSymbolsRequested ?? 0;
  const okCount = diag?.yahooQuoteResultCount ?? 0;
  const coreOk = countCoreAnchorsOk(summary);
  if (coreOk >= 3) return 'ok';
  if (okCount >= 3 || (requested > 0 && okCount / requested >= 0.35)) {
    return 'degraded_usable';
  }
  if (okCount > 0) return 'degraded_usable';
  return 'empty';
}

function countCoreAnchorsOk(summary: UsMarketMorningSummary): number {
  const diag = summary.diagnostics;
  const n = diag?.yahooQuoteResultCount ?? 0;
  if (n === 0) return 0;
  if (n >= 3 && summary.available) return Math.min(3, n);
  return summary.available ? 1 : 0;
}

export function isUsDirectCandidate(c: TodayStockCandidate): boolean {
  return c.country === 'US' || c.market === 'US';
}

export function classifyUsDirectCandidate(
  c: TodayStockCandidate,
  summary: UsMarketMorningSummary,
  opts?: { isHolding?: boolean },
): UsCandidateGateTier {
  const status = resolveUsMarketSummaryStatus(summary);
  const quoteReady = c.dataQuality?.quoteReady !== false && Boolean(c.quoteSymbol || c.googleTicker);

  if (status === 'empty' || status === 'failed' || status === 'unknown') {
    return opts?.isHolding ? 'holding_check_only' : 'diagnostic_only';
  }

  if (status === 'degraded_usable') {
    if (opts?.isHolding && quoteReady) return 'holding_check_only';
    if (c.alreadyInWatchlist && quoteReady && summary.available) return 'diagnostic_only';
    return 'diagnostic_only';
  }

  if (c.alreadyInWatchlist && quoteReady && summary.available) {
    return 'primary_deck';
  }
  if (opts?.isHolding && quoteReady) {
    return 'holding_check_only';
  }
  return quoteReady ? 'diagnostic_only' : 'diagnostic_only';
}

export function buildUsDiagnosticCandidateCard(
  c: TodayStockCandidate,
  summary: UsMarketMorningSummary,
  tier: UsCandidateGateTier,
  opts?: { googleFinanceAnchorSummary?: UsAnchorSummaryContext },
): TodayStockCandidate {
  const isHolding = tier === 'holding_check_only';
  const withSlot: TodayStockCandidate = {
    ...c,
    briefDeckSlot: 'us_market_check',
    score: Math.min(c.score, 52),
    confidence: 'low',
    reasonSummary: isHolding
      ? '보유 중인 미국 종목 — 데이터·리스크 점검 카드(매수 권유 아님).'
      : `${DIAGNOSTIC_COPY.headline} ${DIAGNOSTIC_COPY.body}`,
    reasonDetails: [
      DIAGNOSTIC_COPY.follow,
      summary.summary,
      buildUsAnchorReadbackDetail(summary, opts?.googleFinanceAnchorSummary),
      ...(c.reasonDetails ?? []).slice(0, 2),
    ],
    cautionNotes: [
      '매수 권유 아님',
      '자동 주문 없음',
      '일반 관찰 후보가 아닌 데이터 점검용',
      ...(c.cautionNotes ?? []),
    ],
    displayMetrics: undefined,
  };
  const dm = buildTodayCandidateDisplayMetrics(withSlot, {
    briefDeckSlot: 'us_market_check',
    usMarketSummary: summary,
  });
  return {
    ...withSlot,
    displayMetrics: {
      ...dm,
      candidateCardKind: 'us_data_check' as TodayCandidateCardKind,
      dataStatusUi: 'us_data_missing',
      neutralObservationCopy: isHolding
        ? '미국 보유 종목 데이터 점검 — 일반 관찰 후보와 분리됩니다.'
        : '미국 관심종목 데이터 점검 — 국내 후보를 대체하지 않습니다.',
    },
  };
}

export function partitionUsDirectForBrief(input: {
  usDirectCandidates: TodayStockCandidate[];
  usMarketSummary: UsMarketMorningSummary;
  googleFinanceAnchorSummary?: UsAnchorSummaryContext;
}): {
  diagnosticCards: TodayStockCandidate[];
  primaryEligible: TodayStockCandidate[];
} {
  const diagnosticCards: TodayStockCandidate[] = [];
  const primaryEligible: TodayStockCandidate[] = [];

  for (const c of input.usDirectCandidates) {
    const isHolding = c.candidateId.includes('-holding-');
    const tier = classifyUsDirectCandidate(c, input.usMarketSummary, { isHolding });
    const card = buildUsDiagnosticCandidateCard(c, input.usMarketSummary, tier, {
      googleFinanceAnchorSummary: input.googleFinanceAnchorSummary,
    });
    if (tier === 'primary_deck') {
      primaryEligible.push(card);
    } else {
      diagnosticCards.push(card);
    }
  }

  return {
    diagnosticCards: diagnosticCards.slice(0, 3),
    primaryEligible: primaryEligible.slice(0, 1),
  };
}

/** primary 덱에서 US 데이터 부족 시 잘못 승격된 US 카드를 제거한다. */
export function stripUsFromPrimaryWhenMarketWeak(
  deck: TodayStockCandidate[],
  summary: UsMarketMorningSummary,
): TodayStockCandidate[] {
  const status = resolveUsMarketSummaryStatus(summary);
  if (status === 'ok') {
    return deck.filter((c) => {
      if (!isUsDirectCandidate(c)) return true;
      return c.briefDeckSlot !== 'interest_stock' && c.briefDeckSlot !== 'us_signal_kr';
    });
  }
  return deck.filter((c) => {
    if (c.briefDeckSlot === 'us_market_check') return false;
    if (isUsDirectCandidate(c) && (c.briefDeckSlot === 'interest_stock' || !c.briefDeckSlot)) return false;
    return true;
  });
}

export function attachUsMarketDiagnosticsToBrief(input: {
  primaryDeck: TodayStockCandidate[];
  usDirectCandidates: TodayStockCandidate[];
  usMarketSummary: UsMarketMorningSummary;
  userUsWatchlistCount: number;
  googleFinanceAnchorSummary?: UsAnchorSummaryContext;
}): {
  primaryDeck: TodayStockCandidate[];
  diagnosticCandidateCards: TodayStockCandidate[];
} {
  const status = resolveUsMarketSummaryStatus(input.usMarketSummary);
  let primaryDeck = stripUsFromPrimaryWhenMarketWeak(input.primaryDeck, input.usMarketSummary);
  const { diagnosticCards, primaryEligible } = partitionUsDirectForBrief({
    usDirectCandidates: input.usDirectCandidates,
    usMarketSummary: input.usMarketSummary,
    googleFinanceAnchorSummary: input.googleFinanceAnchorSummary,
  });

  if (status === 'ok' && primaryEligible.length > 0 && !primaryDeck.some((c) => c.briefDeckSlot === 'us_market_check')) {
    if (primaryDeck.length < 3) {
      primaryDeck = [...primaryDeck, primaryEligible[0]!];
    } else {
      diagnosticCards.unshift(primaryEligible[0]!);
    }
  }

  const diagnosticCandidateCards = [...diagnosticCards];
  if (
    (status === 'empty' || status === 'failed' || status === 'degraded_usable') &&
    input.userUsWatchlistCount > 0 &&
    diagnosticCandidateCards.length === 0 &&
    input.usDirectCandidates[0]
  ) {
    diagnosticCandidateCards.push(
      buildUsDiagnosticCandidateCard(input.usDirectCandidates[0], input.usMarketSummary, 'diagnostic_only', {
        googleFinanceAnchorSummary: input.googleFinanceAnchorSummary,
      }),
    );
  }

  return { primaryDeck, diagnosticCandidateCards: diagnosticCandidateCards.slice(0, 3) };
}

export function applyUsAnchorContextToDiagnosticCandidateCard(
  card: TodayStockCandidate,
  summary: UsMarketMorningSummary,
  googleFinanceAnchorSummary?: UsAnchorSummaryContext,
): TodayStockCandidate {
  if (!googleFinanceAnchorSummary || card.briefDeckSlot !== 'us_market_check') {
    return card;
  }
  const anchorDetail = buildUsAnchorReadbackDetail(summary, googleFinanceAnchorSummary);
  const reasonDetails = (card.reasonDetails ?? []).map((detail) =>
    detail.startsWith('미국 시장 anchor:') || detail.startsWith('Google Finance anchor')
      ? anchorDetail
      : detail,
  );
  return { ...card, reasonDetails };
}

export function buildUsMarketAnchorCoverageLabel(
  summary: UsMarketMorningSummary,
  googleFinanceAnchorSummary?: UsAnchorSummaryContext,
): string {
  const normalized = normalizeGoogleFinanceAnchorSummary({
    sheetsAnchorOk: googleFinanceAnchorSummary?.sheetsAnchorOk,
    anchorOk: googleFinanceAnchorSummary?.anchorOk,
    anchorMatched: googleFinanceAnchorSummary?.anchorMatched,
    sheetsAnchorMatched: googleFinanceAnchorSummary?.sheetsAnchorMatched,
    missingAnchors: googleFinanceAnchorSummary?.missingAnchors,
    missingAnchorSymbols: googleFinanceAnchorSummary?.missingAnchorSymbols,
    fallbackOnly: googleFinanceAnchorSummary?.fallbackOnly,
    requestedAnchorCount: summary.diagnostics?.anchorSymbolsRequested,
    receivedAnchorCount: summary.diagnostics?.yahooQuoteResultCount,
  });
  if (normalized.isAnchorOk) {
    return `Google Finance anchor 정상: ${normalized.anchorOkCount}개 확인`;
  }
  if (normalized.isFormulaPending) {
    return `Google Finance anchor 수식 계산 대기: ${normalized.anchorMatchedCount}개 행 매칭`;
  }
  const ok = summary.diagnostics?.yahooQuoteResultCount ?? 0;
  const req = summary.diagnostics?.anchorSymbolsRequested ?? 0;
  const status = resolveUsMarketSummaryStatus(summary);
  const statusKo =
    status === 'ok'
      ? '확인됨'
      : status === 'degraded_usable'
        ? '일부 확인'
        : status === 'empty'
          ? '부족'
          : '조회 실패';
  return `미국 시장 데이터: ${ok}/${req}개 anchor ${statusKo}`;
}
