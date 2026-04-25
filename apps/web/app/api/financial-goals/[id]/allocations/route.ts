import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  insertGoalAllocation,
  listFinancialGoalsForUser,
  listRealizedProfitEventsForUser,
  recalculateGoalAllocated,
} from '@office-unify/supabase-access';
import { mapAllocation, toNum } from '@/lib/server/realizedPnlGoals';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Params) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const goalId = (await context.params).id;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const amountKrw = toNum(body.amountKrw, NaN);
  if (!Number.isFinite(amountKrw) || amountKrw <= 0) {
    return NextResponse.json({ error: 'amountKrw must be > 0.' }, { status: 400 });
  }
  const allocationType = String(body.allocationType ?? 'manual_cash');
  const realizedEventId = body.realizedEventId ? String(body.realizedEventId) : null;
  try {
    if (realizedEventId && allocationType === 'realized_profit') {
      const events = await listRealizedProfitEventsForUser(supabase, auth.userKey);
      const matched = events.find((event) => event.id === realizedEventId);
      if (!matched) return NextResponse.json({ error: 'realizedEvent not found.' }, { status: 404 });
      const net = toNum(matched.net_realized_pnl_krw);
      if (amountKrw > net) {
        return NextResponse.json({ error: 'allocation cannot exceed net realized pnl.' }, { status: 400 });
      }
    }
    const goals = await listFinancialGoalsForUser(supabase, auth.userKey);
    if (!goals.some((goal) => goal.id === goalId)) {
      return NextResponse.json({ error: 'goal not found.' }, { status: 404 });
    }
    const row = await insertGoalAllocation(supabase, auth.userKey, {
      goal_id: goalId,
      realized_event_id: realizedEventId,
      amount_krw: amountKrw,
      allocation_date: body.allocationDate ? String(body.allocationDate) : new Date().toISOString().slice(0, 10),
      allocation_type: allocationType,
      memo: body.memo ? String(body.memo) : null,
    });
    const goalAllocated = await recalculateGoalAllocated(supabase, auth.userKey, goalId);
    return NextResponse.json({ ok: true, allocation: mapAllocation(row), goalAllocated });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
