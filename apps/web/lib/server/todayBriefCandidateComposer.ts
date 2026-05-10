import type {
  SectorRadarSummaryAnchor,
  SectorRadarSummaryResponse,
  SectorRadarSummarySector,
} from '@/lib/sectorRadarContract';
import type { TodayStockCandidate, UsMarketMorningSummary } from '@/lib/todayCandidatesContract';
import { buildTodayCandidateDisplayMetrics } from '@/lib/server/todayBriefCandidateDisplay';

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
  const interestSectors = new Set(
    interestOrdered.map((c) => (c.sector ?? '').trim()).filter((s) => s.length > 1),
  );

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
    reasonSummary: `Sector Radar에서 고른 관찰용 섹터 대표 ETF입니다. (${sector.name}) 매수 권유가 아닙니다.`,
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
    briefDeckSlot: 'sector_etf',
    sectorEtfThemeHint: sector.name,
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

export function composeTodayBriefCandidates(input: {
  userContextCandidates: TodayStockCandidate[];
  sectorRadarSummary: SectorRadarSummaryResponse | null;
  usMarketSummary: UsMarketMorningSummary;
  usMarketKrCandidates: TodayStockCandidate[];
}): {
  deck: TodayStockCandidate[];
  qualityMeta: {
    interestCandidateCount: number;
    sectorRadarEtfCandidateCount: number;
    usSignalCandidateCount: number;
    selectedInterestCount: number;
    selectedSectorEtfCount: number;
    selectionPolicy: string;
    fallbackReason?: string;
    droppedReasons: string[];
  };
} {
  const droppedReasons: string[] = [];
  const interestSorted = [...input.userContextCandidates].sort((a, b) => b.score - a.score);
  const topInterest = interestSorted.slice(0, 2);

  const picked = pickRepresentativeSectorEtf(input.sectorRadarSummary, interestSorted);
  let deck: TodayStockCandidate[] = [];
  let fallbackReason: string | undefined;

  if (picked) {
    const etf = buildSectorRadarEtfCandidate(picked);
    deck = [...topInterest, etf];
    droppedReasons.push('sector_etf_selected_for_slot_3');
  } else {
    fallbackReason = 'sector_etf_unavailable_or_all_quotes_excluded';
    droppedReasons.push(fallbackReason);
    deck = interestSorted.slice(0, 3);
  }

  const enriched = deck.map((c) => {
    const briefDeckSlot: TodayStockCandidate['briefDeckSlot'] =
      c.source === 'sector_radar' ? 'sector_etf' : 'interest_stock';
    const withSlot = { ...c, briefDeckSlot };
    const dm = buildTodayCandidateDisplayMetrics(withSlot, { briefDeckSlot });
    return { ...withSlot, displayMetrics: dm };
  });

  return {
    deck: enriched,
    qualityMeta: {
      interestCandidateCount: input.userContextCandidates.length,
      sectorRadarEtfCandidateCount: picked ? 1 : 0,
      usSignalCandidateCount: input.usMarketKrCandidates.length,
      selectedInterestCount: picked ? Math.min(2, topInterest.length) : Math.min(3, enriched.filter((x) => x.source === 'user_context').length),
      selectedSectorEtfCount: picked ? 1 : 0,
      selectionPolicy: picked
        ? 'interest_top_2_plus_sector_radar_etf_1'
        : 'interest_top_3_fallback_no_sector_etf',
      ...(fallbackReason ? { fallbackReason } : {}),
      droppedReasons,
    },
  };
}
