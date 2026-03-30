import { repoSupabase } from './supabaseClient';

export type RebalancePlanRow = {
  id: string;
  discord_user_id: string;
  chat_history_id: number | null;
  decision_artifact_id: string | null;
  analysis_type: string | null;
  status: string;
  plan_header: string | null;
  summary_json: Record<string, unknown>;
  fx_usdkrw: number | null;
  created_at: string;
  executed_at: string | null;
  executed_by: string | null;
  dismiss_reason: string | null;
  decision_snapshot: string | null;
};

export type RebalancePlanItemRow = {
  symbol: string;
  display_name: string | null;
  side: 'SELL' | 'BUY';
  quantity: number;
  estimated_price: number | null;
  estimated_amount_krw: number | null;
  rationale: string | null;
  market: string | null;
  quote_symbol: string | null;
  sort_order: number;
};

export async function insertRebalancePlanRecord(params: {
  discordUserId: string;
  chatHistoryId: number | null;
  decisionArtifactId: string | null;
  analysisType: string | null;
  planHeader: string;
  summaryJson: Record<string, unknown>;
  fxUsdkrw: number | null;
  decisionSnapshot: string | null;
  items: RebalancePlanItemRow[];
}): Promise<{ planId: string | null; error: string | null }> {
  const { data: planRow, error: pErr } = await repoSupabase
    .from('rebalance_plans')
    .insert({
      discord_user_id: params.discordUserId,
      chat_history_id: params.chatHistoryId,
      decision_artifact_id: params.decisionArtifactId,
      analysis_type: params.analysisType,
      status: 'pending',
      plan_header: params.planHeader,
      summary_json: params.summaryJson,
      fx_usdkrw: params.fxUsdkrw,
      decision_snapshot: params.decisionSnapshot
    })
    .select('id')
    .single();

  if (pErr || !planRow?.id) {
    return { planId: null, error: pErr?.message || 'insert rebalance_plans failed' };
  }

  const planId = String(planRow.id);
  if (params.items.length) {
    const rows = params.items.map((it, i) => ({
      rebalance_plan_id: planId,
      sort_order: it.sort_order ?? i,
      symbol: it.symbol,
      display_name: it.display_name,
      side: it.side,
      quantity: it.quantity,
      estimated_price: it.estimated_price,
      estimated_amount_krw: it.estimated_amount_krw,
      rationale: it.rationale,
      market: it.market,
      quote_symbol: it.quote_symbol
    }));
    const { error: iErr } = await repoSupabase.from('rebalance_plan_items').insert(rows);
    if (iErr) return { planId: null, error: iErr.message };
  }

  return { planId, error: null };
}

export async function getRebalancePlanById(planId: string): Promise<{
  plan: RebalancePlanRow | null;
  items: RebalancePlanItemRow[];
  error: string | null;
}> {
  const { data: plan, error: pErr } = await repoSupabase
    .from('rebalance_plans')
    .select('*')
    .eq('id', planId)
    .maybeSingle();
  if (pErr) return { plan: null, items: [], error: pErr.message };
  if (!plan) return { plan: null, items: [], error: null };

  const { data: items, error: iErr } = await repoSupabase
    .from('rebalance_plan_items')
    .select('symbol,display_name,side,quantity,estimated_price,estimated_amount_krw,rationale,market,quote_symbol,sort_order')
    .eq('rebalance_plan_id', planId)
    .order('sort_order', { ascending: true });
  if (iErr) return { plan: plan as RebalancePlanRow, items: [], error: iErr.message };

  return {
    plan: plan as RebalancePlanRow,
    items: (items || []) as RebalancePlanItemRow[],
    error: null
  };
}

export async function getLatestPendingRebalancePlan(discordUserId: string): Promise<{
  plan: RebalancePlanRow | null;
  items: RebalancePlanItemRow[];
  error: string | null;
}> {
  const { data: plan, error: pErr } = await repoSupabase
    .from('rebalance_plans')
    .select('*')
    .eq('discord_user_id', discordUserId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pErr) return { plan: null, items: [], error: pErr.message };
  if (!plan?.id) return { plan: null, items: [], error: null };
  return getRebalancePlanById(String(plan.id));
}

export async function updateRebalancePlanStatus(params: {
  planId: string;
  discordUserId: string;
  status: 'executed' | 'user_hold' | 'dismissed';
  executedBy?: string | null;
  dismissReason?: string | null;
}): Promise<{ ok: boolean; error: string | null }> {
  const patch: Record<string, unknown> = { status: params.status };
  if (params.status === 'executed') {
    patch.executed_at = new Date().toISOString();
    patch.executed_by = params.executedBy ?? null;
  }
  if (params.dismissReason != null) patch.dismiss_reason = params.dismissReason;

  const { error } = await repoSupabase
    .from('rebalance_plans')
    .update(patch)
    .eq('id', params.planId)
    .eq('discord_user_id', params.discordUserId)
    .eq('status', 'pending');

  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}
