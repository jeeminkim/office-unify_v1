import { repoSupabase } from './supabaseClient';

export type InstrumentCandidateStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';

export type InstrumentCandidateRow = {
  id: string;
  discord_user_id: string;
  raw_input: string;
  requested_market_hint: string | null;
  candidate_payload: unknown;
  trade_qty: number | null;
  trade_price: number | null;
  account_id: string | null;
  pending_pick_index: number | null;
  selected_symbol: string | null;
  selected_display_name: string | null;
  selected_market: string | null;
  selected_exchange: string | null;
  selected_quote_symbol: string | null;
  selected_currency: string | null;
  status: InstrumentCandidateStatus;
  expires_at: string | null;
  created_at: string;
  confirmed_at: string | null;
};

export async function insertInstrumentCandidate(params: {
  discordUserId: string;
  rawInput: string;
  requestedMarketHint: string | null;
  candidatePayload: unknown;
  tradeQty: number;
  tradePrice: number;
  accountId: string | null;
  /** 후보가 1개일 때만 0으로 두어 확인만으로 확정 가능 */
  pendingPickIndex?: number | null;
  expiresHours?: number;
}): Promise<{ id: string | null; error: string | null }> {
  const hours = params.expiresHours ?? 24;
  const expires = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  const { data, error } = await repoSupabase
    .from('instrument_registration_candidates')
    .insert({
      discord_user_id: params.discordUserId,
      raw_input: params.rawInput,
      requested_market_hint: params.requestedMarketHint,
      candidate_payload: params.candidatePayload,
      trade_qty: params.tradeQty,
      trade_price: params.tradePrice,
      account_id: params.accountId,
      status: 'PENDING',
      expires_at: expires,
      pending_pick_index: params.pendingPickIndex ?? null
    })
    .select('id')
    .single();

  if (error) return { id: null, error: error.message };
  return { id: data?.id ? String(data.id) : null, error: null };
}

export async function getInstrumentCandidateById(
  id: string,
  discordUserId: string
): Promise<{ row: InstrumentCandidateRow | null; error: string | null }> {
  const { data, error } = await repoSupabase
    .from('instrument_registration_candidates')
    .select('*')
    .eq('id', id)
    .eq('discord_user_id', discordUserId)
    .maybeSingle();
  if (error) return { row: null, error: error.message };
  return { row: data as InstrumentCandidateRow | null, error: null };
}

export async function updateInstrumentCandidatePick(
  id: string,
  discordUserId: string,
  pendingPickIndex: number
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await repoSupabase
    .from('instrument_registration_candidates')
    .update({ pending_pick_index: pendingPickIndex })
    .eq('id', id)
    .eq('discord_user_id', discordUserId)
    .eq('status', 'PENDING');
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function finalizeInstrumentCandidate(
  id: string,
  discordUserId: string,
  patch: Partial<{
    selected_symbol: string;
    selected_display_name: string;
    selected_market: string;
    selected_exchange: string | null;
    selected_quote_symbol: string | null;
    selected_currency: string;
    status: InstrumentCandidateStatus;
    confirmed_at: string | null;
  }>
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await repoSupabase
    .from('instrument_registration_candidates')
    .update(patch)
    .eq('id', id)
    .eq('discord_user_id', discordUserId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}
