import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';
import { getUsdKrwRate } from './fxService';
import { resolvePurchaseCurrency } from './portfolioCost';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/** 고정 정책: 메인 계좌명은 반드시 이 문자열 (미지정 시 fallback) */
export const GENERAL_ACCOUNT_NAME = '일반계좌';

export type TradeType = 'BUY' | 'SELL';

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 기본 과세 계좌(일반계좌) — 사용자당 1개 자동 생성 */
export async function getOrCreateDefaultAccountId(discordUserId: string): Promise<string> {
  const { data: existing, error: selErr } = await supabase
    .from('accounts')
    .select('id')
    .eq('discord_user_id', discordUserId)
    .eq('account_name', GENERAL_ACCOUNT_NAME)
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing?.id) {
    logger.info('ACCOUNT', 'default account resolved', {
      discordUserId,
      accountId: existing.id,
      account_name: GENERAL_ACCOUNT_NAME
    });
    return existing.id;
  }

  const payload = {
    discord_user_id: discordUserId,
    account_name: GENERAL_ACCOUNT_NAME,
    account_type: 'TAXABLE',
    base_currency: 'KRW',
    is_active: true,
    updated_at: new Date().toISOString()
  };
  const { data: inserted, error: insErr } = await supabase
    .from('accounts')
    .insert(payload)
    .select('id')
    .maybeSingle();
  if (insErr) throw insErr;
  if (!inserted?.id) throw new Error('account insert returned no id');

  logger.info('ACCOUNT', 'account created', {
    discordUserId,
    accountId: inserted.id,
    account_name: GENERAL_ACCOUNT_NAME
  });
  return inserted.id;
}

export async function createAccount(params: {
  discordUserId: string;
  accountName: string;
  accountType: 'TAXABLE' | 'RETIREMENT' | 'PENSION' | 'ISA' | 'OTHER';
  baseCurrency?: string;
}): Promise<string> {
  const { data: dup, error: dupErr } = await supabase
    .from('accounts')
    .select('id')
    .eq('discord_user_id', params.discordUserId)
    .eq('account_name', GENERAL_ACCOUNT_NAME)
    .maybeSingle();
  if (dupErr) throw dupErr;
  if (params.accountName === GENERAL_ACCOUNT_NAME && dup?.id) {
    throw new Error(`계좌명 "${GENERAL_ACCOUNT_NAME}"은(는) 이미 존재합니다.`);
  }

  const payload = {
    discord_user_id: params.discordUserId,
    account_name: params.accountName,
    account_type: params.accountType,
    base_currency: params.baseCurrency || 'KRW',
    is_active: true,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase.from('accounts').insert(payload).select('id').maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error('account insert returned no id');
  logger.info('ACCOUNT', 'account created', {
    discordUserId: params.discordUserId,
    accountId: data.id,
    account_name: params.accountName,
    account_type: params.accountType
  });
  return data.id;
}

/**
 * 실현손익(KRW): 고정 정책 — 가중평균 매입단가(이동평균법, WAC). FIFO 금지.
 * 해당 account_id의 row만 사용. 부분 매도 시에도 남은 수량의 평단은 유지(WAC).
 */
async function computeRealizedPnlKrwForSell(row: any, sellQty: number, sellPricePerUnit: number, fee: number): Promise<number> {
  const market = String(row.market || 'KR').toUpperCase() === 'US' ? 'US' : 'KR';
  const avg = Number(row.avg_purchase_price || 0);
  const fx = market === 'US' ? await getUsdKrwRate() : 1;
  const purchaseCurrency = resolvePurchaseCurrency(row);

  logger.info('TRADE', 'purchase currency interpreted', {
    symbol: row.symbol,
    market,
    purchase_currency: purchaseCurrency,
    purchase_currency_column: row.purchase_currency ?? null
  });

  if (market === 'KR') {
    const cost = sellQty * avg;
    const proceeds = sellQty * sellPricePerUnit - fee;
    return round2(proceeds - cost);
  }

  // US: 매도 단가는 USD/주(시세), 원가는 purchase_currency에 따라 KRW 환산
  const costKrw =
    purchaseCurrency === 'KRW'
      ? sellQty * avg
      : sellQty * avg * fx;
  const proceedsKrw = sellQty * sellPricePerUnit * fx - fee;
  return round2(proceedsKrw - costKrw);
}

export async function recordBuyTrade(params: {
  discordUserId: string;
  accountId?: string;
  symbol: string;
  displayName: string;
  quoteSymbol: string | null;
  exchange: string | null;
  market: 'KR' | 'US';
  currency: 'KRW' | 'USD';
  /** 원가 평단 통화. 미지정 시 market/currency로 추론 */
  purchaseCurrency?: 'KRW' | 'USD';
  quantity: number;
  pricePerUnit: number;
  fee?: number;
  memo?: string;
  tradeDate?: string;
}): Promise<void> {
  const accountId = params.accountId || (await getOrCreateDefaultAccountId(params.discordUserId));
  const fee = params.fee ?? 0;
  const qty = params.quantity;
  const price = params.pricePerUnit;
  const totalAmount = round2(qty * price + fee);

  const purchaseCurrency: 'KRW' | 'USD' =
    params.purchaseCurrency ??
    (params.market === 'US' ? (params.currency === 'USD' ? 'USD' : 'KRW') : 'KRW');

  logger.info('TRADE', 'purchase currency interpreted', {
    symbol: params.symbol,
    market: params.market,
    purchase_currency: purchaseCurrency,
    pricePerUnit: price
  });

  const tradeRow: any = {
    discord_user_id: params.discordUserId,
    account_id: accountId,
    trade_type: 'BUY' as TradeType,
    display_name: params.displayName,
    symbol: params.symbol,
    quote_symbol: params.quoteSymbol,
    market: params.market,
    currency: params.currency,
    purchase_currency: purchaseCurrency,
    quantity: qty,
    price_per_unit: price,
    total_amount: totalAmount,
    fee,
    trade_date: params.tradeDate || new Date().toISOString(),
    memo: params.memo ?? null,
    realized_pnl_krw: null,
    metadata: {}
  };

  const { error: tErr } = await supabase.from('trade_history').insert(tradeRow);
  if (tErr) throw tErr;

  logger.info('TRADE', 'trade history inserted', {
    discordUserId: params.discordUserId,
    accountId,
    trade_type: 'BUY',
    symbol: params.symbol,
    quantity: qty
  });

  const { data: existing, error: rErr } = await supabase
    .from('portfolio')
    .select('id,quantity,avg_purchase_price,purchase_currency')
    .eq('discord_user_id', params.discordUserId)
    .eq('account_id', accountId)
    .eq('symbol', params.symbol)
    .maybeSingle();

  if (rErr) throw rErr;

  const oldQty = existing ? Number(existing.quantity || 0) : 0;
  const oldAvg = existing ? Number(existing.avg_purchase_price || 0) : 0;
  const existingPc = existing?.purchase_currency ? String(existing.purchase_currency).toUpperCase() : null;

  if (existingPc && existingPc !== purchaseCurrency) {
    throw new Error(
      `동일 종목·계좌의 원가 통화는 통일해야 합니다. 기존: ${existingPc}, 신규: ${purchaseCurrency}`
    );
  }

  const newQty = oldQty + qty;
  const newAvg = newQty > 0 ? round2((oldQty * oldAvg + qty * price) / newQty) : price;

  const upsertPayload: any = {
    discord_user_id: params.discordUserId,
    account_id: accountId,
    symbol: params.symbol,
    display_name: params.displayName,
    quote_symbol: params.quoteSymbol,
    exchange: params.exchange,
    market: params.market,
    currency: params.currency,
    purchase_currency: purchaseCurrency,
    quantity: newQty,
    avg_purchase_price: newAvg,
    updated_at: new Date().toISOString()
  };

  const { error: pErr } = await supabase.from('portfolio').upsert(upsertPayload, {
    onConflict: 'discord_user_id,account_id,symbol'
  });
  if (pErr) throw pErr;

  logger.info('TRADE', 'portfolio holdings recalculated', {
    discordUserId: params.discordUserId,
    accountId,
    symbol: params.symbol,
    quantity: newQty,
    avg_purchase_price: newAvg,
    purchase_currency: purchaseCurrency
  });

  logger.info('ACCOUNT', 'account applied to portfolio/trade', {
    discordUserId: params.discordUserId,
    accountId,
    symbol: params.symbol,
    trade_type: 'BUY'
  });
}

export async function recordSellTrade(params: {
  discordUserId: string;
  accountId?: string;
  symbol: string;
  sellQuantity: number;
  sellPricePerUnit: number;
  fee?: number;
  memo?: string;
  tradeDate?: string;
}): Promise<{ realizedPnlKrw: number; accountId: string }> {
  const accountId = params.accountId || (await getOrCreateDefaultAccountId(params.discordUserId));
  const fee = params.fee ?? 0;

  const { data: row, error: rErr } = await supabase
    .from('portfolio')
    .select('*')
    .eq('discord_user_id', params.discordUserId)
    .eq('account_id', accountId)
    .eq('symbol', params.symbol)
    .maybeSingle();

  if (rErr) throw rErr;
  if (!row) throw new Error('보유 종목을 찾을 수 없습니다.');

  const oldQty = Number(row.quantity || 0);
  if (oldQty <= 0) throw new Error('보유 수량이 없습니다.');
  const sellQty = Math.min(params.sellQuantity, oldQty);
  if (sellQty <= 0) throw new Error('매도 수량이 올바르지 않습니다.');

  const purchaseCurrency = resolvePurchaseCurrency(row);
  logger.info('TRADE', 'realized pnl policy applied', {
    policy: 'weighted_average_cost',
    fifo: false,
    symbol: params.symbol,
    accountId,
    purchase_currency: purchaseCurrency
  });

  const realizedPnlKrw = await computeRealizedPnlKrwForSell(row, sellQty, params.sellPricePerUnit, fee);
  const totalAmount = round2(sellQty * params.sellPricePerUnit - fee);

  const tradeRow: any = {
    discord_user_id: params.discordUserId,
    account_id: accountId,
    trade_type: 'SELL' as TradeType,
    display_name: row.display_name,
    symbol: params.symbol,
    quote_symbol: row.quote_symbol,
    market: row.market,
    currency: row.currency,
    purchase_currency: purchaseCurrency,
    quantity: sellQty,
    price_per_unit: params.sellPricePerUnit,
    total_amount: totalAmount,
    fee,
    trade_date: params.tradeDate || new Date().toISOString(),
    memo: params.memo ?? null,
    realized_pnl_krw: realizedPnlKrw,
    metadata: {}
  };

  const { error: tErr } = await supabase.from('trade_history').insert(tradeRow);
  if (tErr) throw tErr;

  logger.info('TRADE', 'trade history inserted', {
    discordUserId: params.discordUserId,
    accountId,
    trade_type: 'SELL',
    symbol: params.symbol,
    quantity: sellQty,
    realizedPnlKrw
  });

  const newQty = round2(oldQty - sellQty);
  if (newQty <= 0) {
    const { error: dErr } = await supabase
      .from('portfolio')
      .delete()
      .eq('discord_user_id', params.discordUserId)
      .eq('account_id', accountId)
      .eq('symbol', params.symbol);
    if (dErr) throw dErr;
  } else {
    const { error: uErr } = await supabase
      .from('portfolio')
      .update({ quantity: newQty, updated_at: new Date().toISOString() })
      .eq('discord_user_id', params.discordUserId)
      .eq('account_id', accountId)
      .eq('symbol', params.symbol);
    if (uErr) throw uErr;
  }

  logger.info('TRADE', 'portfolio holdings recalculated', {
    discordUserId: params.discordUserId,
    accountId,
    symbol: params.symbol,
    remaining_quantity: newQty
  });

  logger.info('TRADE', 'realized pnl updated', {
    discordUserId: params.discordUserId,
    accountId,
    symbol: params.symbol,
    realizedPnlKrw
  });

  logger.info('ACCOUNT', 'account applied to portfolio/trade', {
    discordUserId: params.discordUserId,
    accountId,
    symbol: params.symbol,
    trade_type: 'SELL'
  });

  return { realizedPnlKrw, accountId };
}

export async function listUserAccounts(
  discordUserId: string
): Promise<Array<{ id: string; account_name: string; account_type: string }>> {
  const { data, error } = await supabase
    .from('accounts')
    .select('id,account_name,account_type')
    .eq('discord_user_id', discordUserId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** 퇴직연금 계좌 1개 (RETIREMENT / PENSION 중 먼저 생성된 것) */
export async function findFirstRetirementAccount(
  discordUserId: string
): Promise<{ id: string; account_name: string; account_type: string } | null> {
  const { data, error } = await supabase
    .from('accounts')
    .select('id,account_name,account_type')
    .eq('discord_user_id', discordUserId)
    .in('account_type', ['RETIREMENT', 'PENSION'])
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function findPortfolioRowInAccount(
  discordUserId: string,
  symbol: string,
  accountId: string
): Promise<{ row: any; accountId: string } | null> {
  const sym = String(symbol || '').toUpperCase();
  const { data, error } = await supabase
    .from('portfolio')
    .select('*')
    .eq('discord_user_id', discordUserId)
    .eq('account_id', accountId)
    .eq('symbol', sym)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) return null;
  return { row: data, accountId };
}

/** 매도 시: 일반계좌의 해당 심볼을 우선, 없으면 동일 심볼 첫 행 */
export async function findPortfolioRowForSymbol(
  discordUserId: string,
  symbol: string
): Promise<{ row: any; accountId: string } | null> {
  const sym = String(symbol || '').toUpperCase();
  const defaultId = await getOrCreateDefaultAccountId(discordUserId);
  const { data: primary, error: pErr } = await supabase
    .from('portfolio')
    .select('*')
    .eq('discord_user_id', discordUserId)
    .eq('account_id', defaultId)
    .eq('symbol', sym)
    .maybeSingle();
  if (pErr) throw pErr;
  if (primary?.id) return { row: primary, accountId: defaultId };

  const { data: rows, error: rErr } = await supabase
    .from('portfolio')
    .select('*')
    .eq('discord_user_id', discordUserId)
    .eq('symbol', sym)
    .limit(5);
  if (rErr) throw rErr;
  if (rows && rows[0]) return { row: rows[0], accountId: rows[0].account_id };
  return null;
}
