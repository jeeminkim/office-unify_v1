import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';
import { getLatestQuote } from './quoteService';
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
  };
  positions: PortfolioPositionSnapshot[];
};

function round2(v: number): number {
  return Math.round(v * 100) / 100;
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
  usdkrw: number
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

  const q = await getLatestQuote(
    {
      symbol: normalized.symbol,
      quoteSymbol: normalized.quoteSymbol,
      market,
      currency,
      displayName: normalized.displayName
    },
    Number(row.current_price || 0),
    currency
  );
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
    fxApplied = fxForUs;
    currentPriceUsd = price;
    marketValueUsd = price * quantity;
    mvNative = price * quantity;
    mvKrw = mvNative * fxForUs;

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
      purchase_currency: purchaseCurrency,
      current_price_usd: currentPriceUsd,
      market_value_usd: marketValueUsd,
      usdkrw_rate: fxForUs,
      market_value_krw: mvKrw,
      cost_basis_krw: cbKrw
    });
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
    usdkrw_rate: market === 'US' ? round2(fxForUs) : null
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

  for (const row of rawRows) {
    const pos = await computePositionForRow(row, discordUserId, usdkrw);
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
      us_weight_pct: totalMv > 0 ? round2((us / totalMv) * 100) : 0
    },
    positions: sorted
  };

  logger.info('PORTFOLIO', 'portfolio snapshot built', {
    discordUserId,
    scope,
    totalMarketValueKrw: snapshot.summary.total_market_value_krw,
    totalPnlKrw: snapshot.summary.total_pnl_krw,
    positionCount: snapshot.summary.position_count
  });

  return snapshot;
}
