import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  deleteRealizedProfitEvent,
  listFinancialGoalsForUser,
  updateRealizedProfitEvent,
} from '@office-unify/supabase-access';
import { mapEvent, toNum } from '@/lib/server/realizedPnlGoals';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: Params) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (body.sellQuantity != null) patch.sell_quantity = toNum(body.sellQuantity, NaN);
  if (body.sellPrice != null) patch.sell_price = toNum(body.sellPrice, NaN);
  if (body.avgBuyPrice != null) patch.avg_buy_price = toNum(body.avgBuyPrice, NaN);
  if (body.feeKrw != null) patch.fee_krw = Math.max(0, toNum(body.feeKrw, 0));
  if (body.taxKrw != null) patch.tax_krw = Math.max(0, toNum(body.taxKrw, 0));
  if (body.tradeReason !== undefined) patch.trade_reason = body.tradeReason ? String(body.tradeReason) : null;
  if (body.memo !== undefined) patch.memo = body.memo ? String(body.memo) : null;
  if (body.linkedGoalId !== undefined) patch.linked_goal_id = body.linkedGoalId ? String(body.linkedGoalId) : null;
  if (body.sellDate !== undefined) patch.sell_date = body.sellDate ? String(body.sellDate) : null;
  if (body.name !== undefined) patch.name = body.name ? String(body.name) : null;
  if (body.symbol !== undefined) patch.symbol = String(body.symbol).trim().toUpperCase();
  if (body.market !== undefined) patch.market = body.market === 'KR' || body.market === 'US' ? body.market : undefined;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No patch fields.' }, { status: 400 });
  if (patch.linked_goal_id) {
    const goals = await listFinancialGoalsForUser(supabase, auth.userKey);
    if (!goals.some((goal) => goal.id === patch.linked_goal_id)) {
      return NextResponse.json({ error: 'linkedGoalId not found.' }, { status: 404 });
    }
  }
  try {
    const row = await updateRealizedProfitEvent(supabase, auth.userKey, (await context.params).id, patch);
    const goals = await listFinancialGoalsForUser(supabase, auth.userKey);
    return NextResponse.json({ ok: true, event: mapEvent(row, goals.find((g) => g.id === row.linked_goal_id)?.goal_name) });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: Params) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  try {
    await deleteRealizedProfitEvent(supabase, auth.userKey, (await context.params).id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
