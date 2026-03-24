import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';
import { getLatestQuote } from './quoteService';
import { getUsdKrwRate } from './fxService';
import { normalizePortfolioInstrument } from './instrumentRegistry';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export type PortfolioPositionSnapshot = {
  display_name: string;
  symbol: string;
  quote_symbol: string | null;
  exchange: string | null;
  market: 'KR' | 'US';
  currency: 'KRW' | 'USD';
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
};

export type PortfolioSnapshot = {
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

/**
 * US 종목 평단 통화 추론 (DB에 purchase_currency 없을 때)
 * - currency=KRW → 평단은 원화/주
 * - currency=USD → 평단은 USD/주
 * - 미지정 → 규모 휴리스틱 (큰 값은 원화로 간주)
 */
function inferUsAvgIsKrwPerShare(row: any, avg: number): { isKrw: boolean; suspicious: boolean } {
  const rowCur = String(row.currency || '').toUpperCase();
  if (rowCur === 'KRW') return { isKrw: true, suspicious: false };
  if (rowCur === 'USD') return { isKrw: false, suspicious: false };
  if (avg >= 10000) return { isKrw: true, suspicious: true };
  if (avg <= 500) return { isKrw: false, suspicious: false };
  if (avg > 5000) return { isKrw: true, suspicious: true };
  return { isKrw: false, suspicious: true };
}

export async function buildPortfolioSnapshot(discordUserId: string): Promise<PortfolioSnapshot> {
  const { data, error } = await supabase
    .from('portfolio')
    .select('*')
    .or(`discord_user_id.eq.${discordUserId},user_id.eq.${discordUserId}`);
  if (error) throw error;

  const rows = data || [];
  const usdkrw = await getUsdKrwRate();
  const positions: PortfolioPositionSnapshot[] = [];

  for (const row of rows) {
    const normalized = normalizePortfolioInstrument(row);
    const market = normalizeMarket(normalized.market);
    const currency = normalizeCurrency(normalized.currency, market);
    logger.info('PORTFOLIO', 'portfolio row normalized', {
      discordUserId,
      originalSymbol: row.symbol,
      resolvedSymbol: normalized.symbol,
      quoteSymbol: normalized.quoteSymbol,
      market,
      currency
    });
    const quantity = Number(row.quantity || 0);
    const avg = Number(row.avg_purchase_price || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

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
    if (!Number.isFinite(price) || price <= 0) continue;

    const fxForUs = usdkrw;

    logger.info('PORTFOLIO', 'position valuation inputs', {
      display_name: normalized.displayName,
      symbol: normalized.symbol,
      market,
      currency,
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

    if (market === 'KR') {
      fxApplied = 1;
      mvNative = price * quantity;
      mvKrw = mvNative;
      cbNative = avg * quantity;
      cbKrw = cbNative;
    } else {
      fxApplied = fxForUs;
      mvNative = price * quantity;
      mvKrw = mvNative * fxForUs;

      const { isKrw, suspicious } = inferUsAvgIsKrwPerShare(row, avg);
      if (suspicious) {
        logger.warn('PORTFOLIO', 'suspicious valuation fallback used', {
          symbol: normalized.symbol,
          display_name: normalized.displayName,
          row_currency: row.currency,
          avg_purchase_price: avg,
          inferred_avg_as_krw_per_share: isKrw
        });
      }

      if (isKrw) {
        cbKrw = avg * quantity;
        cbNative = cbKrw / fxForUs;
      } else {
        cbNative = avg * quantity;
        cbKrw = cbNative * fxForUs;
      }
    }

    const pnl = mvKrw - cbKrw;
    const retPct = cbKrw > 0 ? (pnl / cbKrw) * 100 : 0;

    positions.push({
      display_name: normalized.displayName,
      symbol: normalized.symbol,
      quote_symbol: normalized.quoteSymbol,
      exchange: normalized.exchange,
      market,
      currency,
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
      weight_pct: 0
    });
  }

  const totalMv = positions.reduce((a, p) => a + p.market_value_krw, 0);
  const totalCb = positions.reduce((a, p) => a + p.cost_basis_krw, 0);
  const totalPnl = totalMv - totalCb;
  const totalRet = totalCb > 0 ? (totalPnl / totalCb) * 100 : 0;

  for (const p of positions) {
    p.weight_pct = totalMv > 0 ? round2((p.market_value_krw / totalMv) * 100) : 0;
    logger.info('PORTFOLIO', 'position valuation computed', {
      display_name: p.display_name,
      symbol: p.symbol,
      market: p.market,
      currency: p.currency,
      avg_purchase_price: p.avg_purchase_price,
      current_price: p.current_price,
      fx_rate_to_krw: p.fx_rate_to_krw,
      market_value_krw: p.market_value_krw,
      cost_basis_krw: p.cost_basis_krw,
      weight_pct: p.weight_pct
    });
  }

  const sorted = [...positions].sort((a, b) => b.weight_pct - a.weight_pct);
  const top3 = sorted.slice(0, 3).reduce((a, p) => a + p.weight_pct, 0);
  const domestic = positions.filter(p => p.market === 'KR').reduce((a, p) => a + p.market_value_krw, 0);
  const us = positions.filter(p => p.market === 'US').reduce((a, p) => a + p.market_value_krw, 0);

  const snapshot: PortfolioSnapshot = {
    summary: {
      total_market_value_krw: round2(totalMv),
      total_cost_basis_krw: round2(totalCb),
      total_pnl_krw: round2(totalPnl),
      total_return_pct: round2(totalRet),
      position_count: positions.length,
      top3_weight_pct: round2(top3),
      domestic_weight_pct: totalMv > 0 ? round2((domestic / totalMv) * 100) : 0,
      us_weight_pct: totalMv > 0 ? round2((us / totalMv) * 100) : 0
    },
    positions: sorted
  };

  logger.info('PORTFOLIO', 'portfolio snapshot built', {
    discordUserId,
    totalMarketValueKrw: snapshot.summary.total_market_value_krw,
    totalPnlKrw: snapshot.summary.total_pnl_krw,
    positionCount: snapshot.summary.position_count
  });

  return snapshot;
}
