import { NextResponse } from 'next/server';
import { getPortfolioSummaryRead } from '@office-unify/supabase-access';
import { parseOfficeUserKey, type PortfolioSummaryResponseBody } from '@office-unify/shared-types';
import { denyUnlessPortfolioReadSecret } from '@/lib/server/portfolio-read-guard';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { listWebPortfolioHoldingsForUser, listWebPortfolioWatchlistForUser } from '@office-unify/supabase-access';
import { loadHoldingQuotes } from '@/lib/server/marketQuoteService';
import { isHoldingCompleteForValuation } from '@/lib/server/portfolioHoldingValuation';
import { normalizeQuoteKey } from '@/lib/server/quoteReadbackUtils';
import { analyzeThesisHealth } from '@/lib/server/thesisHealthAnalyzer';
import { matchRelatedSectorsForHolding } from '@/lib/server/sectorRadarDossierMatch';
import { buildSectorRadarSummaryForUser } from '@/lib/server/sectorRadarSummaryService';
import { logOpsEvent } from '@/lib/server/opsEventLogger';

type EnhancedPortfolioSummaryResponse = {
  ok: boolean;
  generatedAt: string;
  totalPositions: number;
  totalCostKrw?: number;
  totalValueKrw?: number;
  totalPnlKrw?: number;
  totalPnlRate?: number;
  cashKrw?: number;
  cashWeight?: number;
  topPositions: Array<{
    symbol: string;
    displayName?: string;
    market?: string;
    currency?: string;
    quantity?: number;
    avgPrice?: number;
    currentPrice?: number;
    valueKrw?: number;
    weight?: number;
    pnlRate?: number;
    stale?: boolean;
    /** google_ticker 미설정 시 시트 GOOGLEFINANCE 매핑 전 단계 */
    needsTickerRecommendation?: boolean;
    thesisHealthStatus?: 'healthy' | 'watch' | 'weakening' | 'broken' | 'unknown';
    thesisConfidence?: 'low' | 'medium' | 'high';
    /** 섹터 레이더 최우선 매칭 구간(판단 보조, 자동 주문 없음) */
    sectorRadarBadge?: 'fear' | 'greed';
  }>;
  exposures?: {
    byMarket?: Array<{ key: string; valueKrw: number; weight: number }>;
    byCurrency?: Array<{ key: string; valueKrw: number; weight: number }>;
    bySector?: Array<{ key: string; valueKrw: number; weight: number }>;
  };
  warnings: Array<{ code: string; severity: 'info' | 'warn' | 'danger'; message: string }>;
  dataQuality: {
    quoteAvailable: boolean;
    staleQuoteCount: number;
    missingMetadataCount: number;
    source: string;
    providerUsed?: 'google_sheets_googlefinance' | 'yahoo' | 'none';
    delayed?: boolean;
    delayMinutes?: number;
    missingQuoteSymbols?: string[];
    fxAvailable?: boolean;
    fxProviderUsed?: 'google_sheets_googlefinance' | 'yahoo' | 'none';
    quoteFallbackUsed?: boolean;
    readBackSucceeded?: boolean;
    refreshRequested?: boolean;
    /** 수량·평단 미입력 등으로 평가·비중 집계에서 제외된 보유 행 수 */
    incompleteHoldingCount?: number;
  };
};

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * GET /api/portfolio/summary?userKey=<OfficeUserKey>
 * `portfolio` 테이블 행 수 기반 최소 요약(시세·스냅샷 빌드 없음).
 * Authorization: Bearer <OFFICE_UNIFY_PORTFOLIO_READ_SECRET> 필요.
 */
export async function GET(req: Request) {
  const denied = denyUnlessPortfolioReadSecret(req);
  const { searchParams } = new URL(req.url);
  const preferBearer = searchParams.get('auth') === 'bearer';
  if (preferBearer && denied) return denied;

  const parsedUserKey = parseOfficeUserKey(searchParams.get('userKey'));

  let userKey = parsedUserKey;
  if (!userKey) {
    const auth = await requirePersonaChatAuth();
    if (!auth.ok) {
      if (denied) return denied;
      return auth.response;
    }
    userKey = auth.userKey;
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }

  try {
    const holdings = await listWebPortfolioHoldingsForUser(supabase, userKey);
    const valuationHoldings = holdings.filter((h) => isHoldingCompleteForValuation(h.qty, h.avg_price));
    const incompleteHoldingCount = Math.max(0, holdings.length - valuationHoldings.length);
    const quoteBundle = await loadHoldingQuotes(valuationHoldings.map((holding) => ({
      market: holding.market,
      symbol: holding.symbol,
      displayName: holding.name,
      quoteSymbol: holding.quote_symbol ?? undefined,
      googleTicker: holding.google_ticker ?? undefined,
    })));
    const quoteWarnings = [...quoteBundle.warnings];

    const sectorRadarBadgeByKey = new Map<string, 'fear' | 'greed'>();
    try {
      const [watchlist, radar] = await Promise.all([
        listWebPortfolioWatchlistForUser(supabase, userKey),
        buildSectorRadarSummaryForUser(supabase, userKey),
      ]);
      for (const holding of valuationHoldings) {
        const wl =
          watchlist.find(
            (w) =>
              w.market === holding.market && w.symbol.trim().toUpperCase() === holding.symbol.trim().toUpperCase(),
          ) ?? null;
        const matches = matchRelatedSectorsForHolding(
          {
            market: holding.market,
            symbol: holding.symbol,
            name: holding.name,
            sector: holding.sector ?? null,
            investment_memo: holding.investment_memo ?? null,
            judgment_memo: holding.judgment_memo ?? null,
          },
          wl,
          radar.sectors,
          1,
        );
        const top = matches[0];
        if (!top || top.zone === 'no_data') continue;
        const k = `${holding.market}:${holding.symbol.trim().toUpperCase()}`;
        if (top.zone === 'extreme_fear' || top.zone === 'fear') sectorRadarBadgeByKey.set(k, 'fear');
        else if (top.zone === 'greed' || top.zone === 'extreme_greed') sectorRadarBadgeByKey.set(k, 'greed');
      }
    } catch {
      /* 섹터 배지는 best-effort */
    }

    const topPositionsRaw = valuationHoldings.map((holding) => {
      const quantity = toNumber(holding.qty);
      const avgPrice = toNumber(holding.avg_price);
      const quote = quoteBundle.quoteByHolding.get(normalizeQuoteKey(holding.market, holding.symbol));
      const currency = holding.market === 'US' ? 'USD' : 'KRW';
      const fx = currency === 'USD' ? quoteBundle.usdKrwRate : 1;
      const avgCostNative = quantity * avgPrice;
      const avgCostKrw = fx ? avgCostNative * fx : undefined;
      const currentPrice = quote?.currentPrice;
      const currentValueNative = currentPrice != null ? quantity * currentPrice : undefined;
      const valueKrw = currentValueNative != null && fx ? currentValueNative * fx : undefined;
      const pnlKrw = valueKrw != null && avgCostKrw != null ? valueKrw - avgCostKrw : undefined;
      const pnlRate = currentPrice != null && avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : undefined;
      const thesis = analyzeThesisHealth({
        symbol: holding.symbol,
        market: holding.market,
        currentPrice,
        pnlRate,
        targetPrice: toNumber(holding.target_price) || undefined,
        holdingMemo: holding.investment_memo,
        judgmentMemo: holding.judgment_memo,
      });
      return {
        symbol: holding.symbol,
        displayName: holding.name,
        market: holding.market,
        currency,
        quantity,
        avgPrice,
        currentPrice,
        valueKrw,
        weight: undefined,
        pnlRate,
        stale: quote?.stale ?? true,
        provider: quote?.provider ?? 'none',
        delayed: quote?.delayed ?? true,
        delayMinutes: quote?.delayMinutes,
        sector: holding.sector ?? 'unknown',
        totalCostKrw: avgCostKrw,
        pnlKrw,
        needsTickerRecommendation: !holding.google_ticker?.trim(),
        thesisHealthStatus: thesis.status,
        thesisConfidence: thesis.confidence,
      };
    });
    const hasAnyCost = topPositionsRaw.some((row) => row.totalCostKrw != null);
    const totalCostKrw = hasAnyCost
      ? topPositionsRaw.reduce((acc, row) => acc + (row.totalCostKrw ?? 0), 0)
      : undefined;
    const hasAnyValuation = topPositionsRaw.some((row) => row.valueKrw != null);
    const totalValueKrw = hasAnyValuation
      ? topPositionsRaw.reduce((acc, row) => acc + (row.valueKrw ?? 0), 0)
      : undefined;
    const totalPnlKrw = totalValueKrw != null && totalCostKrw != null ? totalValueKrw - totalCostKrw : undefined;
    const totalPnlRate =
      totalValueKrw != null && totalCostKrw != null && totalCostKrw > 0 && totalPnlKrw != null
        ? (totalPnlKrw / totalCostKrw) * 100
        : undefined;
    const weightBaseKrw = hasAnyValuation
      ? totalValueKrw
      : hasAnyCost
        ? topPositionsRaw.reduce((acc, row) => acc + (row.totalCostKrw ?? 0), 0)
        : undefined;
    const topPositions = [...topPositionsRaw]
      .sort((a, b) => ((b.valueKrw ?? b.totalCostKrw ?? 0) - (a.valueKrw ?? a.totalCostKrw ?? 0)))
      .slice(0, 10)
      .map((row) => ({
        ...row,
        weight:
          weightBaseKrw && weightBaseKrw > 0
            ? (((hasAnyValuation ? row.valueKrw : row.totalCostKrw) ?? 0) / weightBaseKrw) * 100
            : undefined,
        sectorRadarBadge: sectorRadarBadgeByKey.get(`${row.market}:${row.symbol.trim().toUpperCase()}`),
      }));
    const byMarket = Array.from(
      topPositionsRaw.reduce((map, row) => {
        const key = row.market ?? 'unknown';
        map.set(key, (map.get(key) ?? 0) + ((hasAnyValuation ? row.valueKrw : row.totalCostKrw) ?? 0));
        return map;
      }, new Map<string, number>()).entries(),
    ).map(([key, valueKrw]) => ({ key, valueKrw, weight: weightBaseKrw && weightBaseKrw > 0 ? valueKrw / weightBaseKrw : 0 }));
    const byCurrency = Array.from(
      topPositionsRaw.reduce((map, row) => {
        const key = row.currency ?? 'unknown';
        map.set(key, (map.get(key) ?? 0) + ((hasAnyValuation ? row.valueKrw : row.totalCostKrw) ?? 0));
        return map;
      }, new Map<string, number>()).entries(),
    ).map(([key, valueKrw]) => ({ key, valueKrw, weight: weightBaseKrw && weightBaseKrw > 0 ? valueKrw / weightBaseKrw : 0 }));
    const bySector = Array.from(
      topPositionsRaw.reduce((map, row) => {
        const key = row.sector ?? 'unknown';
        map.set(key, (map.get(key) ?? 0) + ((hasAnyValuation ? row.valueKrw : row.totalCostKrw) ?? 0));
        return map;
      }, new Map<string, number>()).entries(),
    ).map(([key, valueKrw]) => ({ key, valueKrw, weight: weightBaseKrw && weightBaseKrw > 0 ? valueKrw / weightBaseKrw : 0 }));

    const warnings: EnhancedPortfolioSummaryResponse['warnings'] = [];
    if (!quoteBundle.quoteAvailable) {
      warnings.push({
        code: 'quote_unavailable',
        severity: 'warn',
        message: '시세 조회 실패로 평가손익을 계산하지 않았습니다.',
      });
      warnings.push({
        code: 'weight_fallback_cost_basis',
        severity: 'info',
        message: '현재 비중은 매입금액 기준입니다.',
      });
    }
    if (quoteWarnings.includes('usdkrw_rate_unavailable') && holdings.some((row) => row.market === 'US')) {
      warnings.push({
        code: 'fx_missing',
        severity: 'warn',
        message: 'USD/KRW 환율을 가져오지 못해 US 종목 KRW 평가값 계산이 제한됩니다.',
      });
    }
    if (quoteWarnings.includes('quote_key_match_failed')) {
      warnings.push({
        code: 'quote_key_match_failed',
        severity: 'warn',
        message: '시트 parsedPrice는 존재하지만 summary 키 매칭에 실패했습니다. normalized_key/market:symbol 매핑을 점검하세요.',
      });
    }
    if (topPositions.some((p) => p.stale)) {
      warnings.push({
        code: 'quote_stale_or_missing',
        severity: 'warn',
        message: 'GOOGLEFINANCE 값은 지연될 수 있으며 일부 종목은 누락될 수 있습니다.',
      });
    }
    if (topPositions.some((p) => (p.weight ?? 0) >= 30)) {
      warnings.push({ code: 'single_position_over_30', severity: 'warn', message: '단일 종목 비중이 30%를 초과합니다.' });
    }
    if (topPositions.slice(0, 3).reduce((acc, p) => acc + (p.weight ?? 0), 0) >= 60) {
      warnings.push({ code: 'top3_over_60', severity: 'warn', message: '상위 3개 종목 비중이 60%를 초과합니다.' });
    }
    if (holdings.length === 0) {
      warnings.push({ code: 'portfolio_no_data', severity: 'info', message: '포트폴리오 데이터가 없습니다.' });
    }
    if (incompleteHoldingCount > 0) {
      warnings.push({
        code: 'holdings_incomplete_excluded',
        severity: 'info',
        message: `수량·평단이 채워지지 않은 보유 ${incompleteHoldingCount}건은 평가·비중·손익 집계에서 제외했습니다.`,
      });
    }
    if (valuationHoldings.some((row) => !row.google_ticker?.trim())) {
      warnings.push({
        code: 'google_ticker_missing',
        severity: 'info',
        message:
          'google_ticker가 비어 있는 보유 종목이 있습니다. /portfolio 또는 원장에서 「추천 ticker 찾기」로 Google Sheets 후보를 검증한 뒤 적용할 수 있습니다.',
      });
    }
    if (topPositions.slice(0, 3).some((p) => (p.pnlRate ?? 0) <= -10)) {
      warnings.push({ code: 'loss_over_10_exists', severity: 'danger', message: '손실률 -10% 이하 종목이 존재합니다.' });
    }
    const missingMetadataCount = valuationHoldings.filter((row) => !row.name || !row.sector).length;
    if (missingMetadataCount > 0) {
      warnings.push({
        code: 'metadata_missing',
        severity: 'info',
        message: `메타데이터(이름/섹터) 누락 종목이 ${missingMetadataCount}개 있습니다.`,
      });
    }

    const enhanced: EnhancedPortfolioSummaryResponse = {
      ok: true,
      generatedAt: new Date().toISOString(),
      totalPositions: holdings.length,
      totalCostKrw,
      totalValueKrw,
      totalPnlKrw,
      totalPnlRate,
      cashKrw: undefined,
      cashWeight: undefined,
      topPositions,
      exposures: { byMarket, byCurrency, bySector },
      warnings,
      dataQuality: {
        quoteAvailable: quoteBundle.quoteAvailable,
        staleQuoteCount: topPositionsRaw.filter((row) => row.stale).length,
        missingMetadataCount,
        source:
          quoteBundle.providerMeta.providerUsed === 'google_sheets_googlefinance'
            ? 'google_sheets_googlefinance_readback'
            : quoteBundle.quoteAvailable
              ? 'yahoo_quote_plus_web_portfolio_holdings'
              : 'web_portfolio_holdings_without_realtime_quotes',
        providerUsed: quoteBundle.providerMeta.providerUsed,
        delayed: quoteBundle.providerMeta.delayed,
        delayMinutes: quoteBundle.providerMeta.delayMinutes,
        missingQuoteSymbols: quoteBundle.providerMeta.missingSymbols,
        fxAvailable: quoteBundle.providerMeta.fxAvailable,
        fxProviderUsed: quoteBundle.providerMeta.fxProviderUsed,
        quoteFallbackUsed: quoteBundle.providerMeta.quoteFallbackUsed,
        readBackSucceeded: quoteBundle.providerMeta.readBackSucceeded,
        refreshRequested: quoteBundle.providerMeta.refreshRequested,
        incompleteHoldingCount,
      },
    };
    if (searchParams.get('format') === 'legacy') {
      const summary = await getPortfolioSummaryRead(supabase, userKey);
      const body: PortfolioSummaryResponseBody = { summary };
      return NextResponse.json(body);
    }
    return NextResponse.json(enhanced);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    void logOpsEvent({
      userKey,
      eventType: 'error',
      severity: 'error',
      domain: 'portfolio',
      route: '/api/portfolio/summary',
      message,
      code: 'portfolio_summary_exception',
      detail: { errorType: e instanceof Error ? e.name : 'unknown' },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
