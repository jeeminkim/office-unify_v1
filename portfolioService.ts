import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';
import {
  getLatestQuote,
  mergeFailureBreakdown,
  type QuotePriceSource,
  type PriceSourceKind
} from './quoteService';
import { getUsdKrwRate } from './fxService';
import { normalizePortfolioInstrument } from './instrumentRegistry';
import { inferUsAvgIsKrwPerShare, resolvePurchaseCurrency } from './portfolioCost';
import { getOrCreateDefaultAccountId } from './tradeService';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export type AccountBreakdownEntry = {
  account_id: string;
  quantity: number;
  market_value_krw: number;
  cost_basis_krw: number;
  purchase_currency: 'KRW' | 'USD';
};

export type PortfolioPositionSnapshot = {
  display_name: string;
  symbol: string;
  quote_symbol: string | null;
  exchange: string | null;
  market: 'KR' | 'US';
  currency: 'KRW' | 'USD';
  /** 원가 평단 통의 (avg_purchase_price 단위와 일치) */
  purchase_currency: 'KRW' | 'USD';
  account_id?: string | null;
  quantity: number;
  avg_purchase_price: number;
  current_price: number;
  price_currency: string;
  fx_rate_to_krw: number;
  market_value_native: number;
  market_value_krw: number;
  cost_basis_native: number;
  cost_basis_krw: number;
  pnl_krw: number;
  return_pct: number;
  weight_pct: number;
  /** US 종목: 현재가·평가는 USD 기준 + KRW 환산 */
  current_price_usd?: number | null;
  market_value_usd?: number | null;
  usdkrw_rate?: number | null;
  /** 시세 해석 메타(표시·감사용) */
  quote_resolved_symbol?: string | null;
  quote_price_source_kind?: PriceSourceKind;
  quote_price_asof?: string | null;
  quote_market_state?: 'open' | 'closed' | 'unknown';
  quote_fallback_reason?: string | null;
  /** 전체 합산(scope ALL) 시 동일 심볼·다계좌 분해 */
  account_breakdown?: AccountBreakdownEntry[];
};

export type PortfolioSnapshot = {
  meta: {
    scope: 'DEFAULT' | 'ALL' | 'ACCOUNT';
    /** 일반계좌 단독(DEFAULT) 또는 명시 계좌(ACCOUNT)일 때 설정 */
    account_id?: string | null;
  };
  summary: {
    total_market_value_krw: number;
    total_cost_basis_krw: number;
    total_pnl_krw: number;
    total_return_pct: number;
    position_count: number;
    top3_weight_pct: number;
    domestic_weight_pct: number;
    us_weight_pct: number;
    quote_failure_count?: number;
    degraded_quote_mode?: boolean;
    /** 요약 한 줄: 가격 기준 시각 등 */
    price_basis_hint?: string;
    partial_quote_warning?: string;
  };
  positions: PortfolioPositionSnapshot[];
};

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function isKrwQuotePathForUs(source?: string, currency?: string): boolean {
  const c = String(currency || '').toUpperCase();
  if (c === 'KRW') return true;
  return (
    source === 'live_krw' ||
    source === 'eod_krw' ||
    source === 'fallback_krw' ||
    source === 'snapshot_krw' ||
    source === 'purchase_basis_krw'
  );
}

function normalizeMarket(value: any): 'KR' | 'US' {
  const m = String(value || '').toUpperCase();
  return m === 'US' ? 'US' : 'KR';
}

function normalizeCurrency(value: any, market: 'KR' | 'US'): 'KRW' | 'USD' {
  const c = String(value || '').toUpperCase();
  if (c === 'USD' || c === 'KRW') return c;
  return market === 'US' ? 'USD' : 'KRW';
}

export type BuildPortfolioSnapshotOptions = {
  /**
   * DEFAULT: 일반계좌만 (미지정 = 일반계좌, 전체 합산 아님)
   * ALL: 전 계좌 합산 (명시적 경로만)
   * ACCOUNT: accountId 필수
   */
  scope?: 'DEFAULT' | 'ALL' | 'ACCOUNT';
  accountId?: string | null;
};

async function computePositionForRow(
  row: any,
  discordUserId: string,
  usdkrw: number,
  quoteStats?: {
    failed: number;
    degraded: number;
    total: number;
    bySymbol: Record<string, number>;
    breakdowns: Array<any>;
    rowDetails: Array<any>;
  }
): Promise<PortfolioPositionSnapshot | null> {
  const normalized = normalizePortfolioInstrument(row);
  const market = normalizeMarket(normalized.market);
  const currency = normalizeCurrency(normalized.currency, market);
  const purchaseCurrency = resolvePurchaseCurrency(row);

  logger.info('PORTFOLIO', 'portfolio row normalized', {
    discordUserId,
    originalSymbol: row.symbol,
    resolvedSymbol: normalized.symbol,
    quoteSymbol: normalized.quoteSymbol,
    market,
    currency,
    purchase_currency: purchaseCurrency
  });

  const quantity = Number(row.quantity || 0);
  const avg = Number(row.avg_purchase_price || 0);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const rowCurrentPrice = Number(row.current_price || 0);
  const fallbackPriceCurrency: 'KRW' | 'USD' =
    market === 'US' && (String(row.currency || '').toUpperCase() === 'KRW' || rowCurrentPrice >= 100000)
      ? 'KRW'
      : currency;
  const fallbackPriceSource: QuotePriceSource =
    fallbackPriceCurrency === 'KRW'
      ? (market === 'US' ? 'snapshot_krw' : 'fallback_krw')
      : 'fallback_usd';

  const q = await getLatestQuote(
    {
      symbol: normalized.symbol,
      quoteSymbol: normalized.quoteSymbol,
      market,
      currency,
      displayName: normalized.displayName,
      exchange: normalized.exchange
    },
    rowCurrentPrice,
    fallbackPriceCurrency,
    fallbackPriceSource
  );
  if (quoteStats) {
    quoteStats.total += 1;
    if (q.failedCandidates > 0) quoteStats.failed += q.failedCandidates;
    if (q.degraded) quoteStats.degraded += 1;
    const key = String(normalized.symbol || row.symbol || 'UNKNOWN');
    quoteStats.bySymbol[key] = (quoteStats.bySymbol[key] || 0) + (q.failedCandidates || 0);
    if (q.failureBreakdown) quoteStats.breakdowns.push(q.failureBreakdown);
    quoteStats.rowDetails.push({
      symbol: key,
      quoteSymbol: normalized.quoteSymbol,
      traceId: q.traceId || null,
      finalSource: q.finalSource || null,
      degraded: q.degraded,
      failedCandidates: q.failedCandidates,
      failureBreakdown: q.failureBreakdown || {}
    });
    logger.info('QUOTE', 'portfolio row quote result', {
      discordUserId,
      symbol: key,
      market,
      traceId: q.traceId || null,
      degraded: q.degraded,
      failedCandidates: q.failedCandidates,
      finalSource: q.finalSource || null,
      failureBreakdown: q.failureBreakdown || {}
    });
  }
  const price = Number(q.price || 0);
  if (!Number.isFinite(price) || price <= 0) return null;

  const fxForUs = usdkrw;

  if (market === 'KR') {
    logger.info('PORTFOLIO', 'valuation currency path selected', {
      symbol: normalized.symbol,
      path: 'kr_krw',
      purchase_currency: purchaseCurrency
    });
  } else {
    logger.info('PORTFOLIO', 'valuation currency path selected', {
      symbol: normalized.symbol,
      path: 'us_quote_usd_cost_basis_by_purchase_currency',
      purchase_currency: purchaseCurrency,
      quote_currency: q.currency
    });
  }

  logger.info('PORTFOLIO', 'position valuation inputs', {
    display_name: normalized.displayName,
    symbol: normalized.symbol,
    market,
    currency,
    purchase_currency: purchaseCurrency,
    row_currency: row.currency ?? null,
    avg_purchase_price: avg,
    current_price: price,
    price_currency_from_quote: q.currency,
    fx_rate_to_krw: market === 'US' ? fxForUs : 1,
    quantity
  });

  let mvNative: number;
  let mvKrw: number;
  let cbNative: number;
  let cbKrw: number;
  let fxApplied: number;
  let currentPriceUsd: number | null = null;
  let marketValueUsd: number | null = null;

  if (market === 'KR') {
    fxApplied = 1;
    mvNative = price * quantity;
    mvKrw = mvNative;
    cbNative = avg * quantity;
    cbKrw = cbNative;
  } else {
    const qCurrency = String(q.currency || 'USD').toUpperCase();
    const source =
      q.priceSource || (qCurrency === 'KRW' ? 'fallback_krw' : 'fallback_usd');
    const isKrwPricePath = isKrwQuotePathForUs(source, qCurrency);

    fxApplied = fxForUs;
    if (isKrwPricePath) {
      mvKrw = price * quantity;
      mvNative = mvKrw / fxForUs;
      currentPriceUsd = price / fxForUs;
      marketValueUsd = mvNative;
    } else {
      currentPriceUsd = price;
      marketValueUsd = price * quantity;
      mvNative = price * quantity;
      mvKrw = mvNative * fxForUs;
    }

    if (purchaseCurrency === 'KRW') {
      cbKrw = avg * quantity;
      cbNative = cbKrw / fxForUs;
    } else {
      cbNative = avg * quantity;
      cbKrw = cbNative * fxForUs;
    }

    const { suspicious } = inferUsAvgIsKrwPerShare(row, avg);
    if (suspicious && !row.purchase_currency) {
      logger.warn('PORTFOLIO', 'suspicious valuation fallback used', {
        symbol: normalized.symbol,
        display_name: normalized.displayName,
        row_currency: row.currency,
        avg_purchase_price: avg,
        purchase_currency_fallback: purchaseCurrency
      });
    }

    logger.info('PORTFOLIO', 'us asset valuation computed', {
      symbol: normalized.symbol,
      quote_price_source: source,
      quote_price_currency: qCurrency,
      purchase_currency: purchaseCurrency,
      current_price_usd: currentPriceUsd,
      market_value_usd: marketValueUsd,
      usdkrw_rate: fxForUs,
      market_value_krw: mvKrw,
      fx_applied_for_quote: !isKrwPricePath,
      cost_basis_krw: cbKrw
    });
    logger.info('PORTFOLIO', 'valuation fallback currency path', {
      symbol: normalized.symbol,
      market,
      fallbackPrice: rowCurrentPrice,
      fallbackPriceCurrency,
      liveOrFallbackSource: source,
      fxApplied: !isKrwPricePath,
      finalMarketValueKrw: round2(mvKrw)
    });
  }

  if (market === 'US' && q.degraded && cbKrw > 0 && mvKrw > cbKrw * 20) {
    logger.warn('PORTFOLIO', 'abnormal valuation guard', {
      symbol: normalized.symbol,
      market,
      current_price: price,
      avg_purchase_price: avg,
      quantity,
      computed_market_value_krw: round2(mvKrw),
      reason: 'degraded_quote_over_20x_cost_basis'
    });
    // conservative fallback to avoid outlier distortion
    mvKrw = cbKrw;
    mvNative = cbNative;
    marketValueUsd = market === 'US' ? cbNative : null;
    currentPriceUsd = quantity > 0 ? cbNative / quantity : currentPriceUsd;
  }

  const pnl = mvKrw - cbKrw;
  const retPct = cbKrw > 0 ? (pnl / cbKrw) * 100 : 0;

  return {
    display_name: normalized.displayName,
    symbol: normalized.symbol,
    quote_symbol: normalized.quoteSymbol,
    exchange: normalized.exchange,
    market,
    currency,
    purchase_currency: purchaseCurrency,
    account_id: row.account_id ?? null,
    quantity,
    avg_purchase_price: avg,
    current_price: price,
    price_currency: q.currency,
    fx_rate_to_krw: market === 'US' ? fxApplied : 1,
    market_value_native: round2(mvNative),
    market_value_krw: round2(mvKrw),
    cost_basis_native: round2(cbNative),
    cost_basis_krw: round2(cbKrw),
    pnl_krw: round2(pnl),
    return_pct: round2(retPct),
    weight_pct: 0,
    current_price_usd: market === 'US' ? round2(currentPriceUsd ?? 0) : null,
    market_value_usd: market === 'US' ? round2(marketValueUsd ?? 0) : null,
    usdkrw_rate: market === 'US' ? round2(fxForUs) : null,
    quote_resolved_symbol: q.resolved_quote_symbol ?? normalized.quoteSymbol,
    quote_price_source_kind: q.price_source_kind,
    quote_price_asof: q.price_asof ?? null,
    quote_market_state: q.market_state,
    quote_fallback_reason: q.fallback_reason ?? null
  };
}

function mergePositionsBySymbol(
  positions: PortfolioPositionSnapshot[],
  discordUserId: string
): PortfolioPositionSnapshot[] {
  const map = new Map<string, PortfolioPositionSnapshot[]>();
  for (const p of positions) {
    const k = String(p.symbol || '').toUpperCase();
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(p);
  }
  const out: PortfolioPositionSnapshot[] = [];
  for (const group of map.values()) {
    if (group.length === 1) {
      const p = group[0];
      out.push({
        ...p,
        account_breakdown: p.account_id
          ? [
              {
                account_id: p.account_id,
                quantity: p.quantity,
                market_value_krw: p.market_value_krw,
                cost_basis_krw: p.cost_basis_krw,
                purchase_currency: p.purchase_currency
              }
            ]
          : undefined
      });
      continue;
    }
    const mvKrw = group.reduce((a, p) => a + p.market_value_krw, 0);
    const cbKrw = group.reduce((a, p) => a + p.cost_basis_krw, 0);
    const qty = group.reduce((a, p) => a + p.quantity, 0);
    const mvUsd = group.reduce((a, p) => a + (p.market_value_usd ?? 0), 0);
    const base = group[0];
    const pnl = mvKrw - cbKrw;
    const retPct = cbKrw > 0 ? (pnl / cbKrw) * 100 : 0;
    const breakdown: AccountBreakdownEntry[] = group.map(p => ({
      account_id: p.account_id || '',
      quantity: p.quantity,
      market_value_krw: p.market_value_krw,
      cost_basis_krw: p.cost_basis_krw,
      purchase_currency: p.purchase_currency
    }));
    logger.info('PORTFOLIO', 'aggregate holdings across accounts (scope ALL)', {
      discordUserId,
      symbol: base.symbol,
      accountCount: group.length,
      quantity: qty
    });
    out.push({
      ...base,
      quantity: round2(qty),
      avg_purchase_price: qty > 0 ? round2(cbKrw / qty) : 0,
      market_value_krw: round2(mvKrw),
      cost_basis_krw: round2(cbKrw),
      pnl_krw: round2(pnl),
      return_pct: round2(retPct),
      weight_pct: 0,
      market_value_native: base.market === 'US' ? round2(mvUsd) : round2(mvKrw),
      cost_basis_native: base.market === 'US' ? round2(cbKrw / (base.usdkrw_rate || 1)) : round2(cbKrw),
      market_value_usd: base.market === 'US' ? round2(mvUsd) : null,
      current_price_usd: base.market === 'US' ? base.current_price_usd : null,
      account_breakdown: breakdown,
      account_id: null
    });
  }
  return out;
}

/**
 * buildPortfolioSnapshot — 계좌 미지정은 일반계좌(DEFAULT)만. 전체 합산은 scope: 'ALL'만 사용.
 */
export async function buildPortfolioSnapshot(
  discordUserId: string,
  options?: BuildPortfolioSnapshotOptions
): Promise<PortfolioSnapshot> {
  const scope: 'DEFAULT' | 'ALL' | 'ACCOUNT' = options?.scope ?? 'DEFAULT';

  let metaAccountId: string | null | undefined;

  let q = supabase.from('portfolio').select('*').or(`discord_user_id.eq.${discordUserId},user_id.eq.${discordUserId}`);

  if (scope === 'ACCOUNT') {
    if (!options?.accountId) throw new Error('buildPortfolioSnapshot: scope ACCOUNT requires accountId');
    q = q.eq('account_id', options.accountId);
    metaAccountId = options.accountId;
  } else if (scope === 'DEFAULT') {
    const generalId = await getOrCreateDefaultAccountId(discordUserId);
    metaAccountId = generalId;
    q = q.eq('account_id', generalId);
    logger.info('PORTFOLIO', 'buildPortfolioSnapshot scope DEFAULT (일반계좌 단독)', {
      discordUserId,
      accountId: generalId
    });
  } else {
    logger.info('PORTFOLIO', 'buildPortfolioSnapshot scope ALL (전체 합산)', { discordUserId });
  }

  const { data, error } = await q;
  if (error) throw error;

  const rawRows = data || [];
  const usdkrw = await getUsdKrwRate();
  const positions: PortfolioPositionSnapshot[] = [];
  const quoteStats = {
    failed: 0,
    degraded: 0,
    total: 0,
    bySymbol: {} as Record<string, number>,
    breakdowns: [] as Array<any>,
    rowDetails: [] as Array<any>
  };

  for (const row of rawRows) {
    const pos = await computePositionForRow(row, discordUserId, usdkrw, quoteStats);
    if (pos) positions.push(pos);
  }

  const merged =
    scope === 'ALL' ? mergePositionsBySymbol(positions, discordUserId) : positions;

  const totalMv = merged.reduce((a, p) => a + p.market_value_krw, 0);
  const totalCb = merged.reduce((a, p) => a + p.cost_basis_krw, 0);
  const totalPnl = totalMv - totalCb;
  const totalRet = totalCb > 0 ? (totalPnl / totalCb) * 100 : 0;

  for (const p of merged) {
    p.weight_pct = totalMv > 0 ? round2((p.market_value_krw / totalMv) * 100) : 0;
    logger.info('PORTFOLIO', 'position valuation computed', {
      display_name: p.display_name,
      symbol: p.symbol,
      market: p.market,
      currency: p.currency,
      purchase_currency: p.purchase_currency,
      avg_purchase_price: p.avg_purchase_price,
      current_price: p.current_price,
      fx_rate_to_krw: p.fx_rate_to_krw,
      market_value_krw: p.market_value_krw,
      cost_basis_krw: p.cost_basis_krw,
      weight_pct: p.weight_pct
    });
  }

  const sorted = [...merged].sort((a, b) => b.weight_pct - a.weight_pct);
  const top3 = sorted.slice(0, 3).reduce((a, p) => a + p.weight_pct, 0);
  const domestic = sorted.filter(p => p.market === 'KR').reduce((a, p) => a + p.market_value_krw, 0);
  const us = sorted.filter(p => p.market === 'US').reduce((a, p) => a + p.market_value_krw, 0);

  const asofDates = sorted.map(p => p.quote_price_asof).filter(Boolean) as string[];
  let price_basis_hint: string | undefined;
  if (asofDates.length) {
    const latest = [...asofDates].sort().pop()!;
    const d = new Date(latest);
    price_basis_hint = `가격 기준(최근 조회 시각): ${d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST`;
  }
  const eodN = sorted.filter(p => p.quote_price_source_kind === 'eod').length;
  const fbN = sorted.filter(p => p.quote_price_source_kind === 'fallback').length;
  const partialLines: string[] = [];
  if (eodN > 0) {
    partialLines.push(
      `· Yahoo 일봉 종가(최근 5거래일) 사용: **${eodN}**종목 (장 마감 후 등 안정 조회)`
    );
  }
  if (fbN > 0) {
    partialLines.push(`· 실시간/차트 실패 후 **저장 스냅샷·매수가** 기준: **${fbN}**종목`);
  }
  const partial_quote_warning = partialLines.length > 0 ? partialLines.join('\n') : undefined;

  const snapshot: PortfolioSnapshot = {
    meta: {
      scope,
      account_id: scope === 'ALL' ? null : metaAccountId ?? null
    },
    summary: {
      total_market_value_krw: round2(totalMv),
      total_cost_basis_krw: round2(totalCb),
      total_pnl_krw: round2(totalPnl),
      total_return_pct: round2(totalRet),
      position_count: sorted.length,
      top3_weight_pct: round2(top3),
      domestic_weight_pct: totalMv > 0 ? round2((domestic / totalMv) * 100) : 0,
      us_weight_pct: totalMv > 0 ? round2((us / totalMv) * 100) : 0,
      quote_failure_count: quoteStats.failed,
      degraded_quote_mode: quoteStats.degraded > 0,
      price_basis_hint,
      partial_quote_warning
    },
    positions: sorted
  };

  const abnormalHeavy = sorted.filter(p => p.market === 'US' && p.weight_pct >= 95);
  if (abnormalHeavy.length > 0) {
    logger.warn('PORTFOLIO', 'snapshot sanity guard triggered', {
      discordUserId,
      abnormalSymbols: abnormalHeavy.map(p => p.symbol),
      weights: abnormalHeavy.map(p => p.weight_pct),
      reason: 'us_single_asset_over_95pct'
    });
  }

  if (quoteStats.failed > 0 || quoteStats.degraded > 0) {
    const statusBreakdownTotal = mergeFailureBreakdown(quoteStats.breakdowns);
    const topFailedSymbols = Object.entries(quoteStats.bySymbol)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([symbol]) => symbol);
    logger.warn('QUOTE', 'quote fetch failures summarized', {
      discordUserId,
      failedCandidates: quoteStats.failed,
      degradedCount: quoteStats.degraded,
      positionCount: quoteStats.total,
      top_failed_symbols: topFailedSymbols,
      status_breakdown_total: statusBreakdownTotal
    });
    logger.warn('QUOTE', 'degraded quote mode used', {
      discordUserId,
      degradedCount: quoteStats.degraded,
      row_quote_details: quoteStats.rowDetails.slice(0, 20)
    });
  }

  logger.info('PORTFOLIO', 'portfolio snapshot built', {
    discordUserId,
    scope,
    totalMarketValueKrw: snapshot.summary.total_market_value_krw,
    totalPnlKrw: snapshot.summary.total_pnl_krw,
    positionCount: snapshot.summary.position_count
  });

  return snapshot;
}
