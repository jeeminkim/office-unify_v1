import type {
  SectorRadarSummaryAnchor,
  SectorRadarSummaryResponse,
  SectorRadarSummarySector,
} from '@/lib/sectorRadarContract';
import type { CandidateDisplaySlot, QuoteRootCauseCode } from '@office-unify/shared-types';
import { getActionReasonContract, resolveActionReasonFromUsDiagnostics } from '@/lib/actionReasonContract';
import type { TodayStockCandidate, UsMarketMorningSummary } from '@/lib/todayCandidatesContract';
import { buildTodayCandidateDisplayMetrics } from '@/lib/server/todayBriefCandidateDisplay';
import type { TodayCandidateRepeatStat } from '@/lib/server/todayCandidateRepeatExposure';
import { repeatExposurePenaltyFromStat } from '@/lib/server/todayCandidateScoring';
import { attachUsMarketDiagnosticsToBrief } from '@/lib/server/todayCandidateUsGating';
import {
  applyQueuePolicyToCandidate,
  classifyTodayCandidateQueue,
} from '@/lib/server/todayCandidateQueuePolicy';

function anchorQuoteAcceptable(a: SectorRadarSummaryAnchor): boolean {
  const q = a.etfQuoteQualityStatus;
  if (q === 'missing' || q === 'invalid') return false;
  return true;
}

function sectorInterestBoost(sector: SectorRadarSummarySector, interestSectors: Set<string>): number {
  let boost = 0;
  const name = sector.name.trim();
  for (const h of interestSectors) {
    if (!h) continue;
    if (name.includes(h) || h.includes(name)) boost += 35;
  }
  return boost;
}

function pickRepresentativeSectorEtf(
  radar: SectorRadarSummaryResponse | null,
  interestOrdered: TodayStockCandidate[],
): { sector: SectorRadarSummarySector; anchor: SectorRadarSummaryAnchor } | null {
  if (!radar?.sectors?.length) return null;
  const interestSectors = new Set(interestOrdered.map((c) => (c.sector ?? '').trim()).filter((s) => s.length > 1));

  const ranked = [...radar.sectors].sort((a, b) => {
    const sa = (a.adjustedScore ?? a.score ?? 0) + sectorInterestBoost(a, interestSectors);
    const sb = (b.adjustedScore ?? b.score ?? 0) + sectorInterestBoost(b, interestSectors);
    return sb - sa;
  });

  const usedThemeKeys = new Set<string>();
  for (const sector of ranked) {
    const gated = sector.etfThemeMeta?.gated === true;
    if (gated && sector.etfThemeMeta?.sectorWarnings?.length) {
      /* still allow scored anchors */
    }
    const scoredFirst = sector.anchors.filter(
      (an) => (an.etfDisplayGroup === 'scored' || an.etfDisplayGroup === undefined) && anchorQuoteAcceptable(an),
    );
    const pool = scoredFirst.length > 0 ? scoredFirst : sector.anchors.filter((an) => anchorQuoteAcceptable(an));
    if (pool.length === 0) continue;
    if (usedThemeKeys.has(sector.key)) continue;
    usedThemeKeys.add(sector.key);
    const anchor = [...pool].sort((x, y) => (y.changePct ?? 0) - (x.changePct ?? 0))[0];
    return { sector, anchor };
  }
  return null;
}

export function buildSectorRadarEtfCandidate(input: {
  sector: SectorRadarSummarySector;
  anchor: SectorRadarSummaryAnchor;
}): TodayStockCandidate {
  const { sector, anchor } = input;
  const adj = sector.adjustedScore ?? sector.score ?? 55;
  const score = Math.max(0, Math.min(100, Math.round(adj)));
  const conf: TodayStockCandidate['confidence'] =
    sector.scoreExplanation?.confidence === 'high'
      ? 'high'
      : sector.scoreExplanation?.confidence === 'medium'
        ? 'medium'
        : 'low';

  return {
    candidateId: `sector-radar-etf-${sector.key}-${anchor.symbol}`,
    name: anchor.name,
    market: 'US',
    country: 'US',
    symbol: `US:${anchor.symbol}`,
    stockCode: anchor.symbol,
    googleTicker: anchor.googleTicker,
    quoteSymbol: anchor.symbol,
    sector: sector.name,
    source: 'sector_radar',
    score,
    confidence: conf,
    riskLevel: sector.zone === 'extreme_greed' ? 'high' : 'medium',
    reasonSummary: `Sector Radar에서 고른 관찰용 섹터 대표 ETF입니다. (${sector.name})`,
    reasonDetails: [
      sector.narrativeHint,
      sector.scoreExplanation?.interpretation ?? sector.scoreExplanation?.summary ?? '',
      anchor.etfThemeUserHint ?? '',
    ].filter(Boolean),
    positiveSignals: ['섹터 테마 관찰', '대표 ETF'],
    cautionNotes: ['매수 권유 아님', '섹터 변동성·환율·추격 매수 주의'],
    relatedUserContext: [],
    relatedWatchlistSymbols: [],
    isBuyRecommendation: false,
    alreadyInWatchlist: false,
    briefDeckSlot: 'sector_etf' as TodayStockCandidate['briefDeckSlot'],
    sectorEtfThemeHint: sector.name,
    scoreBreakdown: {
      baseScore: score,
      watchlistBoost: 0,
      sectorBoost: 0,
      usSignalBoost: 0,
      quoteQualityPenalty: 0,
      repeatExposurePenalty: 0,
      corporateActionPenalty: 0,
      riskPenalty: 0,
      finalScore: score,
    },
    dataQuality: {
      overall: sector.scoreExplanation?.confidence === 'very_low' ? 'low' : 'medium',
      badges: ['섹터 대표 ETF', anchor.etfQuoteQualityStatus === 'stale' ? '시세 지연 가능' : '관찰 ETF'].filter(Boolean),
      reasons: [],
      warnings: [],
      quoteReady: anchor.dataStatus === 'ok',
      sectorConfidence: sector.scoreExplanation?.confidence ?? 'unknown',
      usMarketDataAvailable: true,
    },
  };
}

function deckRank(c: TodayStockCandidate, repeatMap?: Map<string, TodayCandidateRepeatStat>): number {
  const pen = repeatExposurePenaltyFromStat(repeatMap?.get(c.candidateId));
  let r = c.score - pen;
  if (c.confidence === 'very_low') r -= 28;
  if (c.confidence === 'low') r -= 10;
  if (c.source === 'user_context' && c.alreadyInWatchlist) r -= 8;
  return r;
}

function shouldMoveToMonitoring(c: TodayStockCandidate, repeatMap?: Map<string, TodayCandidateRepeatStat>): boolean {
  const policy = classifyTodayCandidateQueue({ candidate: c, repeatStat: repeatMap?.get(c.candidateId) });
  return !policy.shouldIncludeInPrimaryDeck && policy.shouldIncludeInMonitoring;
}

function pickPrimaryRiskCandidate(userCtx: TodayStockCandidate[], usKr: TodayStockCandidate[]): TodayStockCandidate | null {
  const pool = [...userCtx, ...usKr].filter((c) => c.corporateActionRisk?.active);
  if (pool.length === 0) return null;
  return [...pool].sort((a, b) => a.score - b.score)[0] ?? null;
}

function pickInterestSlots(input: {
  userContextCandidates: TodayStockCandidate[];
  usMarketKrCandidates: TodayStockCandidate[];
  riskSlot: TodayStockCandidate | null;
  repeatByCandidateId?: Map<string, TodayCandidateRepeatStat>;
  maxWatchlistLinked: number;
  maxUsMapped: number;
}): TodayStockCandidate[] {
  const repeatMap = input.repeatByCandidateId;
  const blocked = new Set<string>();
  if (input.riskSlot) blocked.add(input.riskSlot.candidateId);

  const uc = input.userContextCandidates.filter((c) => !blocked.has(c.candidateId) && !shouldMoveToMonitoring(c, repeatMap));
  const us = input.usMarketKrCandidates.filter((c) => !blocked.has(c.candidateId) && !shouldMoveToMonitoring(c, repeatMap));

  const entries = [...us.map((c) => ({ c, kind: 'us' as const })), ...uc.map((c) => ({ c, kind: 'uc' as const }))];
  entries.sort((a, b) => deckRank(b.c, repeatMap) - deckRank(a.c, repeatMap));

  const out: TodayStockCandidate[] = [];
  let usUsed = 0;
  let wlUsed = 0;
  const want = input.riskSlot ? 1 : 2;

  for (const { c, kind } of entries) {
    if (out.length >= want) break;
    if (kind === 'us') {
      if (usUsed >= input.maxUsMapped) continue;
      usUsed += 1;
      out.push({ ...c, briefDeckSlot: 'us_signal_kr' as TodayStockCandidate['briefDeckSlot'] });
    } else {
      if (wlUsed >= input.maxWatchlistLinked) continue;
      wlUsed += 1;
      out.push({ ...c, briefDeckSlot: 'interest_stock' as TodayStockCandidate['briefDeckSlot'] });
    }
  }

  if (out.length < want) {
    const rest = [...us, ...uc].filter((c) => !out.some((x) => x.candidateId === c.candidateId));
    rest.sort((a, b) => deckRank(b, repeatMap) - deckRank(a, repeatMap));
    for (const c of rest) {
      if (out.length >= want) break;
      if (c.source === 'us_market_morning') {
        if (usUsed >= input.maxUsMapped) continue;
        usUsed += 1;
        out.push({ ...c, briefDeckSlot: 'us_signal_kr' as TodayStockCandidate['briefDeckSlot'] });
      } else {
        if (wlUsed >= input.maxWatchlistLinked) continue;
        wlUsed += 1;
        out.push({ ...c, briefDeckSlot: 'interest_stock' as TodayStockCandidate['briefDeckSlot'] });
      }
    }
  }

  out.sort((a, b) => {
    const cr = (x: TodayStockCandidate) => (x.confidence === 'very_low' ? 2 : x.confidence === 'low' ? 1 : 0);
    return cr(a) - cr(b);
  });

  return out;
}


export function composeTodayBriefCandidates(input: {
  userContextCandidates: TodayStockCandidate[];
  sectorRadarSummary: SectorRadarSummaryResponse | null;
  usMarketSummary: UsMarketMorningSummary;
  usMarketKrCandidates: TodayStockCandidate[];
  usDirectCandidates?: TodayStockCandidate[];
  userUsWatchlistCount?: number;
  repeatByCandidateId?: Map<string, TodayCandidateRepeatStat>;
}): {
  deck: TodayStockCandidate[];
  diagnosticCandidateCards: TodayStockCandidate[];
  qualityMeta: {
    interestCandidateCount: number;
    sectorRadarEtfCandidateCount: number;
    usSignalCandidateCount: number;
    selectedInterestCount: number;
    selectedSectorEtfCount: number;
    selectionPolicy: string;
    fallbackReason?: string;
    droppedReasons: string[];
    maxWatchlistLinked: number;
    maxUsSignalMapped: number;
    riskReviewIncluded?: boolean;
    usMarketCheckDiagnosticCount?: number;
    usMarketSummaryStatus?: string;
    deckContract: CandidateDeckContractDiagnostics;
    displaySlots: CandidateDisplaySlot[];
  };
} {
  const droppedReasons: string[] = [];
  const interestSorted = [...input.userContextCandidates].sort((a, b) => b.score - a.score);
  const picked = pickRepresentativeSectorEtf(input.sectorRadarSummary, interestSorted);
  let fallbackReason: string | undefined;

  const riskSlot = pickPrimaryRiskCandidate(input.userContextCandidates, input.usMarketKrCandidates);
  if (riskSlot) droppedReasons.push('corporate_action_risk_slot_reserved');
  const repeatedMonitoringCandidates = [...input.userContextCandidates, ...input.usMarketKrCandidates]
    .map((c) => {
      const policy = classifyTodayCandidateQueue({ candidate: c, repeatStat: input.repeatByCandidateId?.get(c.candidateId) });
      return { c, policy };
    })
    .filter(({ policy }) => !policy.shouldIncludeInPrimaryDeck && policy.shouldIncludeInMonitoring)
    .map(({ c, policy }) =>
      applyQueuePolicyToCandidate(
        {
          ...c,
          briefDeckSlot: 'interest_stock' as TodayStockCandidate['briefDeckSlot'],
          reasonDetails: [
            policy.monitoringReason ?? '최근 7일 반복 노출로 메인 큐 대신 모니터링으로 이동했습니다.',
            ...(c.reasonDetails ?? []).slice(0, 3),
          ],
          cautionNotes: [
            '반복 노출 감점 적용',
            ...(c.cautionNotes ?? []).slice(0, 3),
          ],
        },
        policy,
      ),
    );
  if (repeatedMonitoringCandidates.length > 0) droppedReasons.push('repeat_exposure_moved_to_monitoring');

  const interestSlots = pickInterestSlots({
    userContextCandidates: input.userContextCandidates,
    usMarketKrCandidates: input.usMarketKrCandidates,
    riskSlot,
    repeatByCandidateId: input.repeatByCandidateId,
    maxWatchlistLinked: 2,
    maxUsMapped: 1,
  });

  let deck: TodayStockCandidate[] = [];
  if (picked) {
    const etf = buildSectorRadarEtfCandidate(picked);
    if (riskSlot) {
      deck = [...interestSlots, { ...riskSlot, briefDeckSlot: 'risk_review' as TodayStockCandidate['briefDeckSlot'] }, etf];
      droppedReasons.push('deck_order_interest_risk_sector_etf');
    } else {
      deck = [...interestSlots, etf];
      droppedReasons.push('sector_etf_selected_for_slot_3');
    }
  } else {
    fallbackReason = 'sector_etf_unavailable_or_all_quotes_excluded';
    droppedReasons.push(fallbackReason);
    if (riskSlot) {
      const filler = pickInterestSlots({
        userContextCandidates: input.userContextCandidates,
        usMarketKrCandidates: input.usMarketKrCandidates,
        riskSlot,
        repeatByCandidateId: input.repeatByCandidateId,
        maxWatchlistLinked: 2,
        maxUsMapped: 1,
      });
      const need = 2 - filler.length;
      const pad = interestSorted
        .filter((c) => !shouldMoveToMonitoring(c, input.repeatByCandidateId))
        .filter((c) => !filler.some((f) => f.candidateId === c.candidateId) && c.candidateId !== riskSlot.candidateId)
        .slice(0, Math.max(0, need));
      deck = [...filler, { ...riskSlot, briefDeckSlot: 'risk_review' as TodayStockCandidate['briefDeckSlot'] }, ...pad].slice(0, 3);
    } else {
      const nonRepeated = interestSorted.filter((c) => !shouldMoveToMonitoring(c, input.repeatByCandidateId));
      deck = [...interestSlots, ...nonRepeated.filter((c) => !interestSlots.some((s) => s.candidateId === c.candidateId))].slice(0, 3);
      if (deck.length < 3) {
        fallbackReason = 'insufficient_alternatives_after_repeat_exposure_filter';
        droppedReasons.push(fallbackReason);
      }
    }
  }

  const enriched = deck.map((c) => {
    const briefDeckSlot: TodayStockCandidate['briefDeckSlot'] =
      c.briefDeckSlot ?? (c.source === 'sector_radar' ? 'sector_etf' : 'interest_stock');
    const withSlot = { ...c, briefDeckSlot };
    const dm = buildTodayCandidateDisplayMetrics(withSlot, { briefDeckSlot, usMarketSummary: input.usMarketSummary });
    return { ...withSlot, displayMetrics: dm };
  });

  const usAttach = attachUsMarketDiagnosticsToBrief({
    primaryDeck: enriched,
    usDirectCandidates: input.usDirectCandidates ?? [],
    usMarketSummary: input.usMarketSummary,
    userUsWatchlistCount: input.userUsWatchlistCount ?? 0,
  });
  const deckContract = buildCandidateDeckContractDiagnostics({
    primaryDeck: usAttach.primaryDeck,
    diagnosticCandidateCards: [...repeatedMonitoringCandidates, ...usAttach.diagnosticCandidateCards],
    usPoolCount: input.usDirectCandidates?.length ?? 0,
    usSignalCandidateCount: input.usMarketKrCandidates.length,
  });
  const displaySlots = buildCandidateDisplaySlots({
    primaryDeck: usAttach.primaryDeck,
    diagnosticCandidateCards: [...repeatedMonitoringCandidates, ...usAttach.diagnosticCandidateCards],
    deckContract,
  });

  return {
    deck: usAttach.primaryDeck,
    diagnosticCandidateCards: [...repeatedMonitoringCandidates, ...usAttach.diagnosticCandidateCards],
    qualityMeta: {
      interestCandidateCount: input.userContextCandidates.length,
      sectorRadarEtfCandidateCount: picked ? 1 : 0,
      usSignalCandidateCount: input.usMarketKrCandidates.length,
      selectedInterestCount: enriched.filter((x) => x.briefDeckSlot !== 'sector_etf').filter((x) => x.briefDeckSlot !== 'risk_review').length,
      selectedSectorEtfCount: picked ? 1 : 0,
      selectionPolicy: picked
        ? riskSlot
          ? 'interest_1_plus_risk_review_1_plus_sector_radar_etf_1_or_mixed'
          : 'interest_diverse_2_plus_sector_radar_etf_1'
        : riskSlot
          ? 'interest_pad_with_risk_review_no_sector_etf'
          : 'interest_top_3_fallback_no_sector_etf',
      ...(fallbackReason ? { fallbackReason } : {}),
      droppedReasons,
      maxWatchlistLinked: 2,
      maxUsSignalMapped: 1,
      riskReviewIncluded: Boolean(riskSlot),
      usMarketCheckDiagnosticCount: usAttach.diagnosticCandidateCards.length,
      deckContract,
      displaySlots,
    },
  };
}

export type CandidateDeckContractDiagnostics = {
  targetKrSlots: 2;
  filledKrSlots: number;
  targetUsSlots: 1;
  filledUsSlots: number;
  usDiagnosticSlotPresent: boolean;
  usSlotFallbackReason?:
    | 'quote_quality_low'
    | 'low_confidence_mapping'
    | 'us_signal_mapping_empty'
    | 'queue_policy_suppressed'
    | 'no_us_pool'
    | 'us_quote_provider_not_configured'
    | 'us_symbol_resolve_failed'
    | 'us_quote_quality_low'
    | 'insufficient_us_candidates'
    | 'risk_queue_dominates'
    | 'repeat_suppression';
  krSlotFallbackReason?: 'insufficient_kr_candidates';
  deckContractStatus: 'ok' | 'partial' | 'degraded';
  actionHint: string;
};

function candidateKind(c: TodayStockCandidate): CandidateDisplaySlot['kind'] {
  if (c.briefDeckSlot === 'risk_review' || c.candidateAction === 'review_required') return 'risk_review';
  if (c.confidence === 'low' || c.confidence === 'very_low') return 'low_confidence_candidate';
  if (c.displayMetrics?.candidateCardKind === 'us_data_check' || c.briefDeckSlot === 'us_market_check') return 'data_check';
  return 'candidate';
}

function reasonCodeFromUsFallback(
  reason: CandidateDeckContractDiagnostics['usSlotFallbackReason'],
): QuoteRootCauseCode {
  switch (reason) {
    case 'us_quote_provider_not_configured':
      return 'provider_not_configured';
    case 'us_symbol_resolve_failed':
    case 'low_confidence_mapping':
      return 'ticker_mapping_required';
    case 'quote_quality_low':
    case 'us_quote_quality_low':
      return 'quote_rows_missing';
    case 'us_signal_mapping_empty':
      return 'us_signal_mapping_empty';
    case 'queue_policy_suppressed':
    case 'risk_queue_dominates':
    case 'repeat_suppression':
      return 'queue_policy_suppressed';
    case 'no_us_pool':
    case 'insufficient_us_candidates':
    default:
      return 'insufficient_candidates';
  }
}

type CandidateDisplayPrimaryAction = CandidateDisplaySlot['primaryAction'];

function toCandidateDisplayPrimaryAction(actionKey: string): CandidateDisplayPrimaryAction {
  switch (actionKey) {
    case 'none':
    case 'quote_recovery':
    case 'quote_status_check':
    case 'google_finance_setup':
    case 'ticker_resolver':
    case 'us_mapping_diagnosis':
    case 'theme_mapping_check':
    case 'discovery_universe_check':
      return actionKey;
    case 'quote_provider_status':
    case 'google_finance_readback_check':
    case 'us_market_feed_check':
      return 'quote_status_check';
    case 'fix_symbol':
      return 'ticker_resolver';
    case 'candidate_queue_review':
    case 'candidate_shortage_review':
      return 'discovery_universe_check';
    default:
      return 'none';
  }
}

function slotCopy(code: QuoteRootCauseCode): Pick<
  CandidateDisplaySlot,
  'reasonLabelKo' | 'actionHintKo' | 'primaryAction' | 'primaryActionLabelKo'
> {
  const reason =
    code === 'us_market_feed_missing' || code === 'us_signal_mapping_empty'
      ? resolveActionReasonFromUsDiagnostics({ reasonCode: code })
      : getActionReasonContract(code);
  return {
    reasonLabelKo: reason.userTitleKo,
    actionHintKo: reason.actionHintKo,
    primaryAction: toCandidateDisplayPrimaryAction(reason.primaryActionKey),
    primaryActionLabelKo: reason.primaryActionLabelKo,
  };
}

function buildCandidateDisplaySlots(input: {
  primaryDeck: TodayStockCandidate[];
  diagnosticCandidateCards: TodayStockCandidate[];
  deckContract: CandidateDeckContractDiagnostics;
}): CandidateDisplaySlot[] {
  const slots: CandidateDisplaySlot[] = input.primaryDeck.slice(0, 3).map((c, index) => ({
    slotId: `candidate-${c.candidateId}`,
    slotIndex: index + 1,
    targetMarket: c.country === 'US' ? 'US' : c.country === 'KR' ? 'KR' : 'ANY',
    kind: candidateKind(c),
    title: c.name,
    subtitle: c.reasonSummary,
    reasonCode: c.dataQuality?.quoteReady === false ? 'quote_rows_missing' : 'unknown',
    reasonLabelKo: c.briefDeckSlot === 'risk_review' ? 'Risk review' : 'Observation candidate',
    actionHintKo: c.isBuyRecommendation === false ? 'Observation only. No buy/sell/order action is created.' : 'Observation only.',
    primaryAction: 'none',
    primaryActionLabelKo: 'Review card',
    isTradeCandidate: false,
  }));

  if (input.deckContract.filledUsSlots < input.deckContract.targetUsSlots && slots.length < 3) {
    const code = reasonCodeFromUsFallback(input.deckContract.usSlotFallbackReason);
    const copy = slotCopy(code);
    slots.push({
      slotId: 'diagnostic-us-slot',
      slotIndex: slots.length + 1,
      targetMarket: 'US',
      kind: 'us_diagnostic',
      title: 'US candidate diagnostic',
      subtitle: 'US slot is shown as a typed diagnostic instead of a forced candidate.',
      reasonCode: code,
      ...copy,
      isTradeCandidate: false,
    });
  }

  if (input.deckContract.filledKrSlots < input.deckContract.targetKrSlots && slots.length < 3) {
    const copy = slotCopy('insufficient_candidates');
    slots.push({
      slotId: 'diagnostic-kr-slot',
      slotIndex: slots.length + 1,
      targetMarket: 'KR',
      kind: 'insufficient_candidate',
      title: 'KR candidate diagnostic',
      subtitle: 'KR observation slot is short; no synthetic candidate was created.',
      reasonCode: 'insufficient_candidates',
      ...copy,
      isTradeCandidate: false,
    });
  }

  for (const c of input.diagnosticCandidateCards) {
    if (slots.length >= 3) break;
    const us = c.country === 'US' || c.briefDeckSlot === 'us_market_check';
    const code: QuoteRootCauseCode = us ? reasonCodeFromUsFallback(input.deckContract.usSlotFallbackReason) : 'queue_policy_suppressed';
    const copy = slotCopy(code);
    slots.push({
      slotId: `diagnostic-${c.candidateId}`,
      slotIndex: slots.length + 1,
      targetMarket: us ? 'US' : c.country === 'KR' ? 'KR' : 'ANY',
      kind: us ? 'us_diagnostic' : 'data_check',
      title: c.name,
      subtitle: c.reasonSummary,
      reasonCode: code,
      ...copy,
      isTradeCandidate: false,
    });
  }

  while (slots.length < 3) {
    const copy = slotCopy('insufficient_candidates');
    slots.push({
      slotId: `insufficient-slot-${slots.length + 1}`,
      slotIndex: slots.length + 1,
      targetMarket: slots.length === 2 ? 'US' : 'ANY',
      kind: 'insufficient_candidate',
      title: 'Candidate slot unavailable',
      subtitle: 'No forced candidate was created for this slot.',
      reasonCode: 'insufficient_candidates',
      ...copy,
      isTradeCandidate: false,
    });
  }

  return slots.slice(0, 3).map((slot, index) => ({ ...slot, slotIndex: index + 1 }));
}

function inferUsFallbackReason(input: {
  diagnosticCandidateCards: TodayStockCandidate[];
  usPoolCount: number;
  usSignalCandidateCount: number;
}): CandidateDeckContractDiagnostics['usSlotFallbackReason'] {
  const joined = input.diagnosticCandidateCards
    .flatMap((c) => [c.reasonSummary, ...(c.reasonDetails ?? []), ...(c.cautionNotes ?? []), c.queueActionHint ?? ''])
    .join(' ')
    .toLowerCase();
  if (joined.includes('provider_not_configured')) return 'us_quote_provider_not_configured';
  if (joined.includes('resolve_failed') || joined.includes('symbol_resolve')) return 'us_symbol_resolve_failed';
  if (joined.includes('repeat_exposure') || joined.includes('repeat')) return 'repeat_suppression';
  if (joined.includes('risk_review') || joined.includes('corporate_event_risk')) return 'risk_queue_dominates';
  if (joined.includes('quote_quality_low') || joined.includes('quote quality') || joined.includes('시세')) return 'quote_quality_low';
  if (joined.includes('low_confidence_mapping') || joined.includes('mapping confidence')) return 'low_confidence_mapping';
  if (joined.includes('us_signal_mapping_empty') || joined.includes('mapping')) return 'us_signal_mapping_empty';
  if (joined.includes('queue') || joined.includes('suppressed') || joined.includes('monitoring')) return 'queue_policy_suppressed';
  if (input.usPoolCount === 0 && input.usSignalCandidateCount === 0) return 'insufficient_us_candidates';
  return input.diagnosticCandidateCards.length > 0 ? 'queue_policy_suppressed' : 'insufficient_us_candidates';
}

export function buildCandidateDeckContractDiagnostics(input: {
  primaryDeck: TodayStockCandidate[];
  diagnosticCandidateCards: TodayStockCandidate[];
  usPoolCount: number;
  usSignalCandidateCount: number;
}): CandidateDeckContractDiagnostics {
  const filledKrSlots = input.primaryDeck.filter((c) => c.country === 'KR').length;
  const filledUsSlots = input.primaryDeck.filter((c) => c.country === 'US' || c.briefDeckSlot === 'us_market_check').length;
  const usDiagnosticSlotPresent = input.diagnosticCandidateCards.some(
    (c) => c.country === 'US' || c.briefDeckSlot === 'us_market_check' || c.displayMetrics?.candidateCardKind === 'us_data_check',
  );
  const usSatisfied = filledUsSlots >= 1 || usDiagnosticSlotPresent;
  const krSatisfied = filledKrSlots >= 2;
  const usSlotFallbackReason = filledUsSlots >= 1 ? undefined : inferUsFallbackReason(input);
  const krSlotFallbackReason = krSatisfied ? undefined : 'insufficient_kr_candidates';
  const deckContractStatus = krSatisfied && filledUsSlots >= 1 ? 'ok' : usSatisfied || krSatisfied ? 'partial' : 'degraded';
  const actionHint =
    deckContractStatus === 'ok'
      ? '국내 2 + 미국 1 관찰 큐 원칙을 충족했습니다.'
      : usSatisfied
        ? '미국 후보를 강제로 만들지 않고 진단 슬롯으로 대체했습니다.'
        : '후보 풀이 부족해 국내 2 + 미국 1 원칙을 부분 충족했습니다.';
  return {
    targetKrSlots: 2,
    filledKrSlots,
    targetUsSlots: 1,
    filledUsSlots,
    usDiagnosticSlotPresent,
    usSlotFallbackReason,
    krSlotFallbackReason,
    deckContractStatus,
    actionHint,
  };
}
