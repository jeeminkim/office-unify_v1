import type { SupabaseClient } from '@supabase/supabase-js';

export type WebActionItemRow = {
  id: string;
  user_key: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  source_type: string;
  source_id: string | null;
  source_label: string | null;
  source_href: string | null;
  symbol: string | null;
  links_json: Record<string, unknown>;
  detail_json: Record<string, unknown>;
  idempotency_key: string | null;
  dedupe_title_norm: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type InsertActionItemInput = {
  userKey: string;
  title: string;
  description?: string | null;
  status?: string;
  priority?: string;
  sourceType: string;
  sourceId?: string | null;
  sourceLabel?: string | null;
  sourceHref?: string | null;
  symbol?: string | null;
  linksJson?: Record<string, unknown>;
  detailJson?: Record<string, unknown>;
  idempotencyKey?: string | null;
  dedupeTitleNorm: string;
};

export async function insertActionItem(
  supabase: SupabaseClient,
  input: InsertActionItemInput,
): Promise<WebActionItemRow> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('web_action_items')
    .insert({
      user_key: input.userKey,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? 'open',
      priority: input.priority ?? 'medium',
      source_type: input.sourceType,
      source_id: input.sourceId ?? null,
      source_label: input.sourceLabel ?? null,
      source_href: input.sourceHref ?? null,
      symbol: input.symbol ?? null,
      links_json: input.linksJson ?? {},
      detail_json: input.detailJson ?? {},
      idempotency_key: input.idempotencyKey ?? null,
      dedupe_title_norm: input.dedupeTitleNorm,
      updated_at: now,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as WebActionItemRow;
}

export async function findActionItemByDedupe(
  supabase: SupabaseClient,
  userKey: string,
  sourceType: string,
  sourceId: string | null,
  dedupeTitleNorm: string,
): Promise<WebActionItemRow | null> {
  let q = supabase
    .from('web_action_items')
    .select('*')
    .eq('user_key', userKey)
    .eq('source_type', sourceType)
    .eq('dedupe_title_norm', dedupeTitleNorm)
    .not('status', 'in', '("done","dismissed")');
  if (sourceId) q = q.eq('source_id', sourceId);
  else q = q.is('source_id', null);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return (data as WebActionItemRow | null) ?? null;
}

export async function findActionItemByIdempotency(
  supabase: SupabaseClient,
  userKey: string,
  idempotencyKey: string,
): Promise<WebActionItemRow | null> {
  const { data, error } = await supabase
    .from('web_action_items')
    .select('*')
    .eq('user_key', userKey)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return (data as WebActionItemRow | null) ?? null;
}

export async function listActionItemsForUser(
  supabase: SupabaseClient,
  userKey: string,
  filters: {
    status?: string;
    sourceType?: string;
    symbol?: string;
    limit?: number;
  },
): Promise<WebActionItemRow[]> {
  let q = supabase.from('web_action_items').select('*').eq('user_key', userKey);
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.sourceType) q = q.eq('source_type', filters.sourceType);
  if (filters.symbol) q = q.eq('symbol', filters.symbol);
  const { data, error } = await q.order('updated_at', { ascending: false }).limit(filters.limit ?? 200);
  if (error) throw error;
  return (data ?? []) as WebActionItemRow[];
}

export async function getActionItemForUser(
  supabase: SupabaseClient,
  userKey: string,
  id: string,
): Promise<WebActionItemRow | null> {
  const { data, error } = await supabase
    .from('web_action_items')
    .select('*')
    .eq('user_key', userKey)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as WebActionItemRow | null) ?? null;
}

export async function patchActionItemForUser(
  supabase: SupabaseClient,
  userKey: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<WebActionItemRow> {
  const { data, error } = await supabase
    .from('web_action_items')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_key', userKey)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as WebActionItemRow;
}
