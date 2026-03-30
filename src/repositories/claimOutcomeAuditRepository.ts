import { repoSupabase } from './supabaseClient';

export type ClaimAuditRow = {
  id: string;
  claim_id: string;
  discord_user_id: string;
  audit_status: string | null;
  baseline_price: number | null;
  price_after_7d: number | null;
  price_after_30d: number | null;
  realized_return_pct_7d: number | null;
  realized_return_pct_30d: number | null;
  direction_hit_7d: number | null;
  direction_hit_30d: number | null;
  contribution_score: number | null;
  audit_note: string | null;
  linked_symbol: string | null;
};

export async function listClaimAuditsForUpdate(params: {
  discordUserId?: string;
  limit: number;
}): Promise<{ rows: ClaimAuditRow[]; error: string | null }> {
  let q = repoSupabase
    .from('claim_outcome_audit')
    .select(
      'id,claim_id,discord_user_id,audit_status,baseline_price,price_after_7d,price_after_30d,realized_return_pct_7d,realized_return_pct_30d,direction_hit_7d,direction_hit_30d,contribution_score,audit_note,linked_symbol'
    )
    .in('audit_status', ['CREATED', 'PARTIAL'])
    .limit(params.limit);

  if (params.discordUserId) q = q.eq('discord_user_id', params.discordUserId);

  const { data, error } = await q;
  if (error) return { rows: [], error: error.message };
  return { rows: (data || []) as ClaimAuditRow[], error: null };
}

export async function updateClaimOutcomeAudit(
  id: string,
  patch: Record<string, unknown>
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await repoSupabase.from('claim_outcome_audit').update(patch).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function fetchClaimForAudit(claimId: string): Promise<{
  row: {
    id: string;
    discord_user_id: string;
    claim_text: string;
    claim_summary: string;
    claim_type: string;
    persona_name: string;
    created_at: string;
    is_downside_focused: boolean;
    is_actionable: boolean;
  } | null;
  error: string | null;
}> {
  const { data, error } = await repoSupabase
    .from('analysis_claims')
    .select(
      'id,discord_user_id,claim_text,claim_summary,claim_type,persona_name,created_at,is_downside_focused,is_actionable'
    )
    .eq('id', claimId)
    .maybeSingle();
  if (error) return { row: null, error: error.message };
  return { row: data as any, error: null };
}
