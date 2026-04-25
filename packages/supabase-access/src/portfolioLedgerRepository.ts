import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OfficeUserKey,
  PortfolioLedgerHoldingInput,
  PortfolioLedgerWatchlistInput,
} from '@office-unify/shared-types';

export type WebPortfolioHoldingRow = {
  market: string;
  symbol: string;
  name: string;
  google_ticker: string | null;
  quote_symbol: string | null;
  sector: string | null;
  investment_memo: string | null;
  qty: number | string | null;
  avg_price: number | string | null;
  target_price: number | string | null;
  judgment_memo: string | null;
  updated_at?: string | null;
};

export type WebPortfolioWatchlistRow = {
  market: string;
  symbol: string;
  name: string;
  sector: string | null;
  investment_memo: string | null;
  interest_reason: string | null;
  desired_buy_range: string | null;
  observation_points: string | null;
  priority: string | null;
  updated_at?: string | null;
};

export async function listWebPortfolioHoldingsForUser(
  client: SupabaseClient,
  userKey: OfficeUserKey,
): Promise<WebPortfolioHoldingRow[]> {
  const { data, error } = await client
    .from('web_portfolio_holdings')
    .select(
      'market,symbol,name,google_ticker,quote_symbol,sector,investment_memo,qty,avg_price,target_price,judgment_memo,updated_at',
    )
    .eq('user_key', userKey as string)
    .order('market', { ascending: true })
    .order('symbol', { ascending: true });
  if (error) throw error;
  return (data ?? []) as WebPortfolioHoldingRow[];
}

export async function listWebPortfolioWatchlistForUser(
  client: SupabaseClient,
  userKey: OfficeUserKey,
): Promise<WebPortfolioWatchlistRow[]> {
  const { data, error } = await client
    .from('web_portfolio_watchlist')
    .select(
      'market,symbol,name,sector,investment_memo,interest_reason,desired_buy_range,observation_points,priority,updated_at',
    )
    .eq('user_key', userKey as string)
    .order('market', { ascending: true })
    .order('symbol', { ascending: true });
  if (error) throw error;
  return (data ?? []) as WebPortfolioWatchlistRow[];
}

export async function upsertPortfolioHolding(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  row: PortfolioLedgerHoldingInput,
): Promise<void> {
  const pk = userKey as string;
  const payload: Record<string, unknown> = {
    user_key: pk,
    market: row.market,
    symbol: row.symbol.trim(),
    name: row.name.trim(),
    sector: row.sector ?? null,
    investment_memo: row.investment_memo ?? null,
    qty: row.qty ?? null,
    avg_price: row.avg_price ?? null,
    target_price: row.target_price ?? null,
    judgment_memo: row.judgment_memo ?? null,
    updated_at: new Date().toISOString(),
  };
  if (row.google_ticker !== undefined) {
    payload.google_ticker = row.google_ticker?.trim() || null;
  }
  if (row.quote_symbol !== undefined) {
    payload.quote_symbol = row.quote_symbol?.trim() || null;
  }
  const { error } = await client.from('web_portfolio_holdings').upsert(payload, { onConflict: 'user_key,market,symbol' });
  if (error) throw error;
}

export async function upsertPortfolioWatchlist(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  row: PortfolioLedgerWatchlistInput,
): Promise<void> {
  const pk = userKey as string;
  const { error } = await client.from('web_portfolio_watchlist').upsert(
    {
      user_key: pk,
      market: row.market,
      symbol: row.symbol.trim(),
      name: row.name.trim(),
      sector: row.sector ?? null,
      investment_memo: row.investment_memo ?? null,
      interest_reason: row.interest_reason ?? null,
      desired_buy_range: row.desired_buy_range ?? null,
      observation_points: row.observation_points ?? null,
      priority: row.priority ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_key,market,symbol' },
  );
  if (error) throw error;
}

export async function deletePortfolioHolding(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  market: 'KR' | 'US',
  symbol: string,
): Promise<void> {
  const { error } = await client
    .from('web_portfolio_holdings')
    .delete()
    .eq('user_key', userKey as string)
    .eq('market', market)
    .eq('symbol', symbol.trim());
  if (error) throw error;
}

export async function deletePortfolioWatchlist(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  market: 'KR' | 'US',
  symbol: string,
): Promise<void> {
  const { error } = await client
    .from('web_portfolio_watchlist')
    .delete()
    .eq('user_key', userKey as string)
    .eq('market', market)
    .eq('symbol', symbol.trim());
  if (error) throw error;
}
