import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  insertGoalAllocation,
  insertRealizedProfitEvent,
  listFinancialGoalsForUser,
  listGoalAllocationsForUser,
  listRealizedProfitEventsForUser,
  recalculateGoalAllocated,
} from '@office-unify/supabase-access';
import { mapEvent, toNum } from '@/lib/server/realizedPnlGoals';

export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  try {
    const [events, goals] = await Promise.all([
      listRealizedProfitEventsForUser(supabase, auth.userKey),
      listFinancialGoalsForUser(supabase, auth.userKey),
    ]);
    const goalMap = new Map(goals.map((goal) => [goal.id, goal.goal_name]));
    return NextResponse.json({ ok: true, events: events.map((row) => mapEvent(row, goalMap.get(row.linked_goal_id ?? ''))) });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
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
  const market = body.market === 'KR' || body.market === 'US' ? body.market : null;
  const symbol = String(body.symbol ?? '').trim().toUpperCase();
  const sellQuantity = toNum(body.sellQuantity, NaN);
  const sellPrice = toNum(body.sellPrice, NaN);
  const avgBuyPrice = toNum(body.avgBuyPrice, NaN);
  const feeKrw = Math.max(0, toNum(body.feeKrw, 0));
  const taxKrw = Math.max(0, toNum(body.taxKrw, 0));
  if (!market || !symbol) return NextResponse.json({ error: 'market and symbol are required.' }, { status: 400 });
  if (!Number.isFinite(sellQuantity) || sellQuantity <= 0) return NextResponse.json({ error: 'sellQuantity must be >0' }, { status: 400 });
  if (!Number.isFinite(sellPrice) || sellPrice <= 0) return NextResponse.json({ error: 'sellPrice must be >0' }, { status: 400 });
  if (!Number.isFinite(avgBuyPrice) || avgBuyPrice <= 0) return NextResponse.json({ error: 'avgBuyPrice must be >0' }, { status: 400 });
  const realizedPnl = (sellPrice - avgBuyPrice) * sellQuantity;
  const realizedPnlRate = (sellPrice - avgBuyPrice) / avgBuyPrice;
  const netRealizedPnl = realizedPnl - feeKrw - taxKrw;
  const linkedGoalId = body.linkedGoalId ? String(body.linkedGoalId) : null;
  const allocationAmountKrw = body.allocationAmountKrw == null ? undefined : toNum(body.allocationAmountKrw, NaN);
  if (allocationAmountKrw != null) {
    if (!Number.isFinite(allocationAmountKrw) || allocationAmountKrw < 0) {
      return NextResponse.json({ error: 'allocationAmountKrw must be >= 0' }, { status: 400 });
    }
    if (allocationAmountKrw > netRealizedPnl) {
      return NextResponse.json({ error: 'allocation cannot exceed netRealizedPnl' }, { status: 400 });
    }
  }
  try {
    if (linkedGoalId) {
      const goals = await listFinancialGoalsForUser(supabase, auth.userKey);
      if (!goals.some((goal) => goal.id === linkedGoalId)) {
        return NextResponse.json({ error: 'linkedGoalId not found.' }, { status: 404 });
      }
    }
    const row = await insertRealizedProfitEvent(supabase, auth.userKey, {
      market,
      symbol,
      name: body.name ? String(body.name) : null,
      sell_date: body.sellDate ? String(body.sellDate) : new Date().toISOString().slice(0, 10),
      sell_quantity: sellQuantity,
      avg_buy_price: avgBuyPrice,
      sell_price: sellPrice,
      realized_pnl_krw: realizedPnl,
      realized_pnl_rate: realizedPnlRate,
      fee_krw: feeKrw,
      tax_krw: taxKrw,
      net_realized_pnl_krw: netRealizedPnl,
      trade_reason: body.tradeReason ? String(body.tradeReason) : null,
      memo: body.memo ? String(body.memo) : null,
      linked_goal_id: linkedGoalId,
      source: body.source ? String(body.source) : 'manual_entry',
    });
    let goalAllocated: number | undefined;
    if (linkedGoalId && allocationAmountKrw && allocationAmountKrw > 0) {
      await insertGoalAllocation(supabase, auth.userKey, {
        goal_id: linkedGoalId,
        realized_event_id: row.id,
        amount_krw: allocationAmountKrw,
        allocation_date: new Date().toISOString().slice(0, 10),
        allocation_type: 'realized_profit',
        memo: '실현손익 이벤트 연결 배분',
      });
      goalAllocated = await recalculateGoalAllocated(supabase, auth.userKey, linkedGoalId);
    }
    const [goals, allocations] = await Promise.all([
      listFinancialGoalsForUser(supabase, auth.userKey),
      listGoalAllocationsForUser(supabase, auth.userKey),
    ]);
    return NextResponse.json({
      ok: true,
      event: mapEvent(row, goals.find((goal) => goal.id === row.linked_goal_id)?.goal_name),
      linkedAllocationCount: allocations.filter((a) => a.realized_event_id === row.id).length,
      goalAllocated,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
