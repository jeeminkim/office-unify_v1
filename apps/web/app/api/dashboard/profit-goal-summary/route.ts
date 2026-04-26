import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  listFinancialGoalsForUser,
  listGoalAllocationsForUser,
  listRealizedProfitEventsForUser,
} from '@office-unify/supabase-access';

function toNum(v: number | string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' }, { status: 503 });
  }

  try {
    const [events, goals, allocations] = await Promise.all([
      listRealizedProfitEventsForUser(supabase, auth.userKey),
      listFinancialGoalsForUser(supabase, auth.userKey),
      listGoalAllocationsForUser(supabase, auth.userKey),
    ]);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const monthRealizedPnl = events
      .filter((e) => {
        const d = new Date(e.sell_date);
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((acc, e) => acc + toNum(e.net_realized_pnl_krw), 0);
    const yearRealizedPnl = events
      .filter((e) => new Date(e.sell_date).getFullYear() === y)
      .reduce((acc, e) => acc + toNum(e.net_realized_pnl_krw), 0);
    const allocationsByGoal = new Map<string, number>();
    allocations.forEach((a) => {
      const key = a.goal_id;
      allocationsByGoal.set(key, (allocationsByGoal.get(key) ?? 0) + toNum(a.amount_krw));
    });
    const rows = goals.map((g) => {
      const allocated = allocationsByGoal.get(g.id) ?? toNum(g.current_allocated_krw);
      const target = toNum(g.target_amount_krw);
      return {
        goalId: g.id,
        goalName: g.goal_name,
        allocated,
        progressPct: target > 0 ? (allocated / target) * 100 : undefined,
      };
    }).sort((a, b) => b.allocated - a.allocated);

    const allocatedTotal = rows.reduce((acc, r) => acc + r.allocated, 0);
    return NextResponse.json({
      ok: true,
      monthRealizedPnl,
      yearRealizedPnl,
      allocations: rows,
      unallocatedAmount: monthRealizedPnl - allocatedTotal,
      warnings: rows.length === 0 ? ['financial_goals_no_data'] : [],
      degraded: false,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'unknown error' }, { status: 500 });
  }
}

