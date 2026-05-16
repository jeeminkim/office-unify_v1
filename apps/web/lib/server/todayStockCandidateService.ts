import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfficeUserKey } from '@office-unify/shared-types';
import { listWebPortfolioHoldingsForUser, listWebPortfolioWatchlistForUser } from '@office-unify/supabase-access';
import { buildSectorRadarSummaryForUser } from './sectorRadarSummaryService';
import { buildUsMarketMorningSummary } from './usMarketMorningSummary';
import { pickRulesFromUsSummary } from './todayCandidateRules';
import type { TodayStockCandidate, UsMarketMorningSummary } from '../todayCandidatesContract';
import { buildCandidateDataQuality } from '../todayCandidateDataQuality';
import type { SectorRadarSummarySector } from '../sectorRadarContract';
import { resolveCorporateActionRiskForStockCode } from '@/lib/server/corporateActionRiskRegistry';
import { applyCorporateActionRiskGate, clampObservationScore, sparseDataBaseScore } from '@/lib/server/todayCandidateScoring';

function clampScore(n: number): number {
  return clampObservationScore(n);
}

function scoreCandidate(input: {
  base: number;
  watchlistBoost?: number;
  sectorBoost?: number;
  usBoost?: number;
  confidencePenalty?: number;
  quoteQualityPenalty?: number;
  riskPenalty?: number;
}): number {
  return clampScore(
    input.base +
      (input.watchlistBoost ?? 0) +
      (input.sectorBoost ?? 0) +
      (input.usBoost ?? 0) -
      (input.confidencePenalty ?? 0) -
      (input.quoteQualityPenalty ?? 0) -
      (input.riskPenalty ?? 0),
  );
}

function buildEtfThemeBriefForToday(sectorInfo: SectorRadarSummarySector | undefined): string | null {
  if (!sectorInfo?.anchors?.length) return null;
  const scored = sectorInfo.anchors.filter((a) => a.etfDisplayGroup === 'scored').length;
  const watchOnly = sectorInfo.anchors.filter((a) => a.etfDisplayGroup === 'watch_only').length;
  const strict = sectorInfo.anchors.filter((a) => a.etfReasonCodes?.includes('etf_theme_strict_match')).length;
  const adjacent = sectorInfo.anchors.filter((a) => a.etfReasonCodes?.includes('etf_theme_adjacent_match')).length;
  const diagnosticOnly = sectorInfo.anchors.some((a) => a.etfReasonCodes?.includes('etf_theme_gate_diagnostic_only'));
  const watchMissing = sectorInfo.anchors.filter((a) => a.etfReasonCodes?.includes('etf_quote_missing')).length;
  const watchStale = sectorInfo.anchors.filter((a) => a.etfReasonCodes?.includes('etf_quote_stale')).length;
  const watchInvalid = sectorInfo.anchors.filter((a) => a.etfReasonCodes?.includes('etf_quote_invalid')).length;
  const watchUnknown = sectorInfo.anchors.filter((a) => a.etfReasonCodes?.includes('etf_quote_unknown_freshness')).length;

  if (diagnosticOnly) {
    return 'ETF 테마 진단만 수행했고 점수 제한은 적용하지 않았습니다.';
  }
  if (strict > 0 && scored > 0 && watchOnly === 0) {
    return `ETF 테마: 직접 관련 ETF(${strict}개)를 점수에 반영했습니다.`;
  }
  if (adjacent > 0 && scored > 0) {
    return `ETF 테마: 직접 관련 ETF(${scored}개)와 인접 관찰 ETF(${adjacent}개)를 구분해 해석하세요.`;
  }
  if (watchOnly > 0) {
    if (watchStale > 0) return `ETF 테마: 관련 ETF ${watchOnly}개 중 ${watchStale}개는 시세 갱신 지연으로 점수 미반영입니다.`;
    if (watchInvalid > 0) return `ETF 테마: 관련 ETF ${watchOnly}개 중 ${watchInvalid}개는 시세 값 이상으로 점수 미반영입니다.`;
    if (watchUnknown > 0) return `ETF 테마: 관련 ETF ${watchOnly}개 중 ${watchUnknown}개는 시세 신선도 확인 불가로 점수 미반영입니다.`;
    if (watchMissing > 0) return `ETF 테마: 관련 ETF ${watchOnly}개 중 ${watchMissing}개는 시세 누락으로 점수 미반영입니다.`;
    return `ETF 테마: 관련 ETF ${watchOnly}개는 시세 품질 이슈로 점수 미반영입니다.`;
  }
  return null;
}

export async function buildTodayStockCandidates(input: {
  supabase: SupabaseClient;
  userKey: OfficeUserKey;
  limitPerSection?: number;
}): Promise<{
  userContextCandidates: TodayStockCandidate[];
  usMarketKrCandidates: TodayStockCandidate[];
  usMarketSummary: UsMarketMorningSummary;
  sectorRadarSummary: import('@/lib/sectorRadarContract').SectorRadarSummaryResponse | null;
  warnings: string[];
  confidenceCounts: {
    high: number;
    medium: number;
    low: number;
    very_low: number;
  };
  /** 빈 KR 매핑 ops용 */
  usKrRulesMatchedCount: number;
  usKrMappedRawCount: number;
}> {
  const limit = Math.max(1, Math.min(5, input.limitPerSection ?? 3));
  const warnings: string[] = [];

  const [watchlist, holdings, sectorRadar, trendSignalsRes] = await Promise.all([
    listWebPortfolioWatchlistForUser(input.supabase, input.userKey).catch(() => []),
    listWebPortfolioHoldingsForUser(input.supabase, input.userKey).catch(() => []),
    buildSectorRadarSummaryForUser(input.supabase, input.userKey, { isReadOnlyRoute: true }).catch(() => null),
    input.supabase
      .from('trend_memory_signals_v2')
      .select('topic_key,signal_name,confidence')
      .eq('user_key', input.userKey as string)
      .order('last_seen_at', { ascending: false })
      .limit(20),
  ]);

  const usWatchSymbols = watchlist
    .filter((w) => w.market === 'US')
    .map((w) => String(w.symbol ?? '').trim())
    .filter(Boolean);

  const usSummary = await buildUsMarketMorningSummary({ extraQuoteSymbols: usWatchSymbols });

  const trendTopics = (trendSignalsRes.data ?? []).map((x) => `${x.topic_key ?? ''} ${x.signal_name ?? ''}`.toLowerCase());

  const userContextCandidates: TodayStockCandidate[] = watchlist
    .filter((w) => w.market === 'KR')
    .slice(0, limit)
    .map((w) => {
      const related = trendTopics.filter((t) => t.includes((w.sector ?? '').toLowerCase())).slice(0, 2);
      const sectorInfo = sectorRadar?.sectors.find((s) => (w.sector ?? '').includes(s.name));
      const etfThemeBrief = buildEtfThemeBriefForToday(sectorInfo);
      const sectorConfidence = sectorInfo?.scoreExplanation?.confidence;
      const quoteReady = Boolean(w.quote_symbol || w.google_ticker);
      const sparse = !quoteReady || !sectorInfo || sectorConfidence === 'very_low' || sectorConfidence === 'low';
      const baseScore = sparse ? sparseDataBaseScore(`${w.symbol}-${w.sector ?? ''}`) : 52;
      const confidencePenalty = sectorConfidence === 'very_low' || sectorConfidence === 'low' ? 12 : sparse ? 4 : 0;
      const quoteQualityPenalty = quoteReady ? 0 : 10;
      const riskPenalty = sectorInfo?.zone === 'extreme_greed' ? 8 : 0;
      const sectorBoost = sectorConfidence === 'high' ? 6 : sectorConfidence === 'medium' ? 3 : 0;
      const watchlistBoost = 8;
      const finalScore = scoreCandidate({
        base: baseScore,
        watchlistBoost,
        sectorBoost,
        confidencePenalty,
        quoteQualityPenalty,
        riskPenalty,
      });

      let cand: TodayStockCandidate = {
        candidateId: `user-context-${w.market}-${w.symbol}`,
        name: w.name,
        market: w.quote_symbol?.endsWith('.KQ') ? 'KOSDAQ' : 'KOSPI',
        country: 'KR',
        symbol: `${w.market}:${w.symbol}`,
        stockCode: w.symbol,
        googleTicker: w.google_ticker ?? undefined,
        quoteSymbol: w.quote_symbol ?? undefined,
        sector: w.sector ?? undefined,
        source: 'user_context',
        score: finalScore,
        confidence: confidencePenalty > 0 ? 'low' : sparse ? 'low' : 'medium',
        riskLevel: riskPenalty > 0 ? 'high' : 'medium',
        reasonSummary: '내 관심종목·섹터 흐름과 연결된 관찰 후보입니다.',
        reasonDetails: [
          '관심종목에 이미 포함된 종목입니다.',
          sectorInfo ? `Sector Radar ${sectorInfo.name} 신뢰도 ${sectorInfo.scoreExplanation?.confidence ?? 'unknown'}` : '섹터 레이더 연결 정보는 제한적입니다.',
          ...(etfThemeBrief ? [etfThemeBrief] : []),
          related.length > 0 ? `최근 Trend memory 연관 키워드: ${related.join(', ')}` : '최근 Trend memory 직접 연결은 제한적입니다.',
        ],
        positiveSignals: ['관심종목 기반', '개인화 관찰 흐름 반영'],
        cautionNotes: ['매수 권유 아님', '시세/뉴스/실적/리스크 확인 필요', '추격매수 주의'],
        relatedUserContext: related,
        relatedWatchlistSymbols: [`${w.market}:${w.symbol}`],
        isBuyRecommendation: false,
        alreadyInWatchlist: true,
        scoreBreakdown: {
          baseScore,
          watchlistBoost,
          sectorBoost,
          usSignalBoost: 0,
          quoteQualityPenalty,
          repeatExposurePenalty: 0,
          corporateActionPenalty: 0,
          riskPenalty: riskPenalty + confidencePenalty,
          finalScore,
        },
        dataQuality: buildCandidateDataQuality({
          confidence: confidencePenalty > 0 ? 'low' : sparse ? 'low' : 'medium',
          quoteReady,
          sectorConfidence: sectorConfidence ?? 'unknown',
          usMarketDataAvailable: usSummary.available,
          hasWatchlistLink: true,
          cautionNotes: ['매수 권유 아님', '시세/뉴스/실적/리스크 확인 필요', '추격매수 주의'],
          source: 'user_context',
        }),
      };

      const corp = resolveCorporateActionRiskForStockCode(w.symbol);
      if (corp?.active) {
        cand = { ...cand, corporateActionRisk: corp };
        cand = applyCorporateActionRiskGate(cand);
      }
      return cand;
    });

  const usRules = pickRulesFromUsSummary(usSummary);
  const mappedRawAll = usRules.flatMap((r) => r.krCandidates);
  const usKrMappedRawCount = mappedRawAll.length;

  if (!usSummary.available && (usSummary.signals?.length ?? 0) === 0) warnings.push('us_market_no_data');
  if (usSummary.diagnostics?.coverageStatus === 'degraded') warnings.push('us_market_coverage_degraded');

  const mappingConfidence: TodayStockCandidate['confidence'] =
    usSummary.available && usSummary.diagnostics?.coverageStatus !== 'degraded'
      ? 'medium'
      : usSummary.available
        ? 'low'
        : 'very_low';

  const usMarketKrCandidates: TodayStockCandidate[] = usRules
    .flatMap((r) =>
      r.krCandidates.map((c) => {
        const quoteReadyKr = Boolean(c.quoteSymbol || c.googleTicker);
        const sparse = !quoteReadyKr || mappingConfidence === 'very_low';
        const baseScore = sparse ? sparseDataBaseScore(c.stockCode) : 50;
        const usBoost = usSummary.signals.length > 0 ? 10 : 4;
        const confidencePenalty = mappingConfidence === 'very_low' ? 14 : mappingConfidence === 'low' ? 6 : 0;
        const quoteQualityPenalty = quoteReadyKr ? 0 : 8;
        const finalScore = scoreCandidate({
          base: baseScore,
          usBoost,
          confidencePenalty,
          quoteQualityPenalty,
        });

        let cand: TodayStockCandidate = {
          candidateId: `us-${r.usSignalKey}-${c.stockCode}`,
          name: c.name,
          market: c.market,
          country: 'KR',
          symbol: `KR:${c.stockCode}`,
          stockCode: c.stockCode,
          googleTicker: c.googleTicker,
          quoteSymbol: c.quoteSymbol,
          sector: c.sector,
          source: 'us_market_morning',
          score: finalScore,
          confidence: mappingConfidence,
          riskLevel: 'medium',
          reasonSummary: `${r.label} 신호를 참고한 한국 상장 관찰 후보입니다.`,
          reasonDetails: [r.conditionHint, c.reason, '미국 신호가 한국 종목 움직임을 보장하지 않습니다.'],
          positiveSignals: [r.label],
          cautionNotes: ['매수 권유 아님', c.caution, '장 초반 급등 추격 주의'],
          relatedUserContext: [],
          relatedWatchlistSymbols: watchlist.filter((w) => w.market === 'KR').map((w) => `${w.market}:${w.symbol}`),
          relatedUsMarketSignals: [r.usSignalKey],
          isBuyRecommendation: false,
          alreadyInWatchlist: watchlist.some((w) => w.market === 'KR' && (w.symbol === c.stockCode || (w.google_ticker ?? '') === c.googleTicker)),
          scoreBreakdown: {
            baseScore,
            watchlistBoost: 0,
            sectorBoost: 0,
            usSignalBoost: usBoost,
            quoteQualityPenalty,
            repeatExposurePenalty: 0,
            corporateActionPenalty: 0,
            riskPenalty: confidencePenalty,
            finalScore,
          },
          dataQuality: buildCandidateDataQuality({
            confidence: mappingConfidence,
            quoteReady: quoteReadyKr,
            sectorConfidence: 'unknown',
            usMarketDataAvailable: usSummary.available,
            hasWatchlistLink: watchlist.some((w) => w.market === 'KR' && w.symbol === c.stockCode),
            cautionNotes: ['매수 권유 아님', c.caution, '장 초반 급등 추격 주의'],
            source: 'us_market_morning',
          }),
        };

        const corp = resolveCorporateActionRiskForStockCode(c.stockCode);
        if (corp?.active) {
          cand = { ...cand, corporateActionRisk: corp };
          cand = applyCorporateActionRiskGate(cand);
        }
        return cand;
      }),
    )
    .slice(0, Math.max(3, limit));

  if (usRules.length > 0 && mappedRawAll.length > 0 && usMarketKrCandidates.length === 0) warnings.push('us_market_candidates_empty_after_trim');
  if ((usSummary.signals?.length ?? 0) > 0 && usMarketKrCandidates.length === 0) warnings.push('us_market_candidates_empty');

  if (holdings.length === 0 && watchlist.length === 0) warnings.push('user_context_sparse');
  const all = [...userContextCandidates, ...usMarketKrCandidates];
  const confidenceCounts = {
    high: all.filter((x) => x.confidence === 'high').length,
    medium: all.filter((x) => x.confidence === 'medium').length,
    low: all.filter((x) => x.confidence === 'low').length,
    very_low: all.filter((x) => x.confidence === 'very_low').length,
  };

  return {
    userContextCandidates,
    usMarketKrCandidates,
    usMarketSummary: usSummary,
    sectorRadarSummary: sectorRadar,
    warnings,
    confidenceCounts,
    usKrRulesMatchedCount: usRules.length,
    usKrMappedRawCount,
  };
}
