import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfficeUserKey } from '@office-unify/shared-types';
import { listWebPortfolioHoldingsForUser, listWebPortfolioWatchlistForUser } from '@office-unify/supabase-access';
import { buildSectorRadarSummaryForUser } from './sectorRadarSummaryService';
import { buildUsMarketMorningSummary } from './usMarketMorningSummary';
import { pickRulesFromUsSummary } from './todayCandidateRules';
import type { TodayStockCandidate, UsMarketMorningSummary } from '../todayCandidatesContract';
import { buildCandidateDataQuality } from '../todayCandidateDataQuality';
import type { SectorRadarSummarySector } from '../sectorRadarContract';

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function scoreCandidate(input: { base: number; watchlistBoost?: number; usBoost?: number; confidencePenalty?: number; riskPenalty?: number }): number {
  return clampScore(input.base + (input.watchlistBoost ?? 0) + (input.usBoost ?? 0) - (input.confidencePenalty ?? 0) - (input.riskPenalty ?? 0));
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
  warnings: string[];
  confidenceCounts: {
    high: number;
    medium: number;
    low: number;
    very_low: number;
  };
}> {
  const limit = Math.max(1, Math.min(5, input.limitPerSection ?? 3));
  const warnings: string[] = [];

  const [watchlist, holdings, sectorRadar, usSummary, trendSignalsRes] = await Promise.all([
    listWebPortfolioWatchlistForUser(input.supabase, input.userKey).catch(() => []),
    listWebPortfolioHoldingsForUser(input.supabase, input.userKey).catch(() => []),
    buildSectorRadarSummaryForUser(input.supabase, input.userKey, { isReadOnlyRoute: true }).catch(() => null),
    buildUsMarketMorningSummary(),
    input.supabase
      .from('trend_memory_signals_v2')
      .select('topic_key,signal_name,confidence')
      .eq('user_key', input.userKey as string)
      .order('last_seen_at', { ascending: false })
      .limit(20),
  ]);

  const trendTopics = (trendSignalsRes.data ?? []).map((x) => `${x.topic_key ?? ''} ${x.signal_name ?? ''}`.toLowerCase());

  const userContextCandidates: TodayStockCandidate[] = watchlist
    .filter((w) => w.market === 'KR')
    .slice(0, limit)
    .map((w) => {
      const related = trendTopics.filter((t) => t.includes((w.sector ?? '').toLowerCase())).slice(0, 2);
      const sectorInfo = sectorRadar?.sectors.find((s) => (w.sector ?? '').includes(s.name));
      const etfThemeBrief = buildEtfThemeBriefForToday(sectorInfo);
      const sectorConfidence = sectorInfo?.scoreExplanation?.confidence;
      const confidencePenalty = sectorConfidence === 'very_low' || sectorConfidence === 'low' ? 12 : 0;
      const riskPenalty = sectorInfo?.zone === 'extreme_greed' ? 8 : 0;
      const score = scoreCandidate({ base: 50, watchlistBoost: 10, confidencePenalty, riskPenalty });
      return {
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
        score,
        confidence: confidencePenalty > 0 ? 'low' : 'medium',
        riskLevel: riskPenalty > 0 ? 'high' : 'medium',
        reasonSummary: '내 관심종목/섹터 관심 흐름과 연결된 관찰 후보입니다.',
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
        dataQuality: buildCandidateDataQuality({
          confidence: confidencePenalty > 0 ? 'low' : 'medium',
          quoteReady: Boolean(w.quote_symbol || w.google_ticker),
          sectorConfidence: sectorConfidence ?? 'unknown',
          usMarketDataAvailable: usSummary.available,
          hasWatchlistLink: true,
          cautionNotes: ['매수 권유 아님', '시세/뉴스/실적/리스크 확인 필요', '추격매수 주의'],
          source: 'user_context',
        }),
      };
    });

  const usRules = pickRulesFromUsSummary(usSummary);
  if (!usSummary.available) warnings.push('us_market_no_data');
  const usMarketKrCandidates: TodayStockCandidate[] = (!usSummary.available || usSummary.conclusion === 'no_data' ? [] : usRules)
    .flatMap((r) =>
      r.krCandidates.map((c) => {
        const confidence: TodayStockCandidate['confidence'] = usSummary.available ? 'medium' : 'very_low';
        return ({
        candidateId: `us-${r.usSignalKey}-${c.stockCode}`,
        name: c.name,
        market: c.market,
        country: 'KR' as const,
        symbol: `KR:${c.stockCode}`,
        stockCode: c.stockCode,
        googleTicker: c.googleTicker,
        quoteSymbol: c.quoteSymbol,
        sector: c.sector,
        source: 'us_market_morning' as const,
        score: scoreCandidate({ base: 52, usBoost: 12, confidencePenalty: usSummary.available ? 0 : 12 }),
        confidence,
        riskLevel: 'medium' as const,
        reasonSummary: `${r.label} 신호를 참고한 한국 상장 관찰 후보입니다. 매수 점수가 아닌 관찰 우선순위입니다.`,
        reasonDetails: [r.conditionHint, c.reason, '미국 신호가 한국 종목 상승을 보장하지 않습니다.'],
        positiveSignals: [r.label],
        cautionNotes: ['매수 권유 아님', c.caution, '장 초반 급등 추격 주의'],
        relatedUserContext: [],
        relatedWatchlistSymbols: watchlist.filter((w) => w.market === 'KR').map((w) => `${w.market}:${w.symbol}`),
        relatedUsMarketSignals: [r.usSignalKey],
        isBuyRecommendation: false as const,
        alreadyInWatchlist: watchlist.some((w) => w.market === 'KR' && (w.symbol === c.stockCode || (w.google_ticker ?? '') === c.googleTicker)),
        dataQuality: buildCandidateDataQuality({
          confidence,
          quoteReady: Boolean(c.quoteSymbol || c.googleTicker),
          sectorConfidence: 'unknown',
          usMarketDataAvailable: usSummary.available,
          hasWatchlistLink: watchlist.some((w) => w.market === 'KR' && w.symbol === c.stockCode),
          cautionNotes: ['매수 권유 아님', c.caution, '장 초반 급등 추격 주의'],
          source: 'us_market_morning',
        }),
      })}),
    )
    .slice(0, Math.max(3, limit));

  if (usSummary.available && usSummary.conclusion !== 'no_data' && usMarketKrCandidates.length === 0) warnings.push('us_market_candidates_empty');
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
    warnings,
    confidenceCounts,
  };
}
