import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfficeUserKey } from '@office-unify/shared-types';

export type DbRealizedProfitEventRow = {
  id: string;
  user_key: string;
  market: 'KR' | 'US';
  symbol: string;
  name: string | null;
  sell_date: string;
  sell_quantity: number | string;
  avg_buy_price: number | string | null;
  sell_price: number | string;
  realized_pnl_krw: number | string | null;
  realized_pnl_rate: number | string | null;
  fee_krw: number | string | null;
  tax_krw: number | string | null;
  net_realized_pnl_krw: number | string | null;
  trade_reason: string | null;
  memo: string | null;
  linked_goal_id: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

export type DbFinancialGoalRow = {
  id: string;
  user_key: string;
  goal_name: string;
  goal_type: string;
  target_amount_krw: number | string;
  current_allocated_krw: number | string;
  target_date: string | null;
  priority: string;
  status: string;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

export type DbGoalAllocationRow = {
  id: string;
  user_key: string;
  goal_id: string;
  realized_event_id: string | null;
  amount_krw: number | string;
  allocation_date: string;
  allocation_type: string;
  memo: string | null;
  created_at: string;
};

export async function listRealizedProfitEventsForUser(client: SupabaseClient, userKey: OfficeUserKey) {
  const { data, error } = await client
    .from('realized_profit_events')
    .select('*')
    .eq('user_key', userKey as string)
    .order('sell_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbRealizedProfitEventRow[];
}

export async function insertRealizedProfitEvent(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  row: Omit<DbRealizedProfitEventRow, 'id' | 'user_key' | 'created_at' | 'updated_at'>,
) {
  const { data, error } = await client
    .from('realized_profit_events')
    .insert({ ...row, user_key: userKey as string })
    .select('*')
    .single();
  if (error) throw error;
  return data as DbRealizedProfitEventRow;
}

export async function updateRealizedProfitEvent(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  id: string,
  patch: Partial<Omit<DbRealizedProfitEventRow, 'id' | 'user_key' | 'created_at' | 'updated_at'>>,
) {
  const { data, error } = await client
    .from('realized_profit_events')
    .update(patch)
    .eq('user_key', userKey as string)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as DbRealizedProfitEventRow;
}

export async function deleteRealizedProfitEvent(client: SupabaseClient, userKey: OfficeUserKey, id: string) {
  const { error } = await client.from('realized_profit_events').delete().eq('user_key', userKey as string).eq('id', id);
  if (error) throw error;
}

export async function listFinancialGoalsForUser(client: SupabaseClient, userKey: OfficeUserKey) {
  const { data, error } = await client
    .from('financial_goals')
    .select('*')
    .eq('user_key', userKey as string)
    .order('status', { ascending: true })
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbFinancialGoalRow[];
}

export async function insertFinancialGoal(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  row: Omit<DbFinancialGoalRow, 'id' | 'user_key' | 'created_at' | 'updated_at'>,
) {
  const { data, error } = await client
    .from('financial_goals')
    .insert({ ...row, user_key: userKey as string })
    .select('*')
    .single();
  if (error) throw error;
  return data as DbFinancialGoalRow;
}

export async function updateFinancialGoal(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  id: string,
  patch: Partial<Omit<DbFinancialGoalRow, 'id' | 'user_key' | 'created_at' | 'updated_at'>>,
) {
  const { data, error } = await client
    .from('financial_goals')
    .update(patch)
    .eq('user_key', userKey as string)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as DbFinancialGoalRow;
}

export async function deleteFinancialGoal(client: SupabaseClient, userKey: OfficeUserKey, id: string) {
  const { error } = await client.from('financial_goals').delete().eq('user_key', userKey as string).eq('id', id);
  if (error) throw error;
}

export async function listGoalAllocationsForUser(client: SupabaseClient, userKey: OfficeUserKey) {
  const { data, error } = await client
    .from('goal_allocations')
    .select('*')
    .eq('user_key', userKey as string)
    .order('allocation_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbGoalAllocationRow[];
}

export async function insertGoalAllocation(
  client: SupabaseClient,
  userKey: OfficeUserKey,
  row: Omit<DbGoalAllocationRow, 'id' | 'user_key' | 'created_at'>,
) {
  const { data, error } = await client
    .from('goal_allocations')
    .insert({ ...row, user_key: userKey as string })
    .select('*')
    .single();
  if (error) throw error;
  return data as DbGoalAllocationRow;
}

export async function deleteGoalAllocation(client: SupabaseClient, userKey: OfficeUserKey, id: string) {
  const { error } = await client.from('goal_allocations').delete().eq('user_key', userKey as string).eq('id', id);
  if (error) throw error;
}

export async function recalculateGoalAllocated(client: SupabaseClient, userKey: OfficeUserKey, goalId: string) {
  const { data, error } = await client
    .from('goal_allocations')
    .select('amount_krw')
    .eq('user_key', userKey as string)
    .eq('goal_id', goalId);
  if (error) throw error;
  const total = (data ?? []).reduce((acc, row) => acc + (Number(row.amount_krw ?? 0) || 0), 0);
  const { error: updateError } = await client
    .from('financial_goals')
    .update({ current_allocated_krw: total, updated_at: new Date().toISOString() })
    .eq('user_key', userKey as string)
    .eq('id', goalId);
  if (updateError) throw updateError;
  return total;
}
