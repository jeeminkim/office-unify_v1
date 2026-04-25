import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  listFinancialGoalsForUser,
  listGoalAllocationsForUser,
  listRealizedProfitEventsForUser,
} from '@office-unify/supabase-access';
import { mapEvent, toNum } from '@/lib/server/realizedPnlGoals';
import type { RealizedPnlSummaryResponseBody } from '@office-unify/shared-types';

function isInLastDays(dateStr: string, days: number): boolean {
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= days * 24 * 60 * 60 * 1000;
}

export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  try {
    const [events, goals, allocations] = await Promise.all([
      listRealizedProfitEventsForUser(supabase, auth.userKey),
      listFinancialGoalsForUser(supabase, auth.userKey),
      listGoalAllocationsForUser(supabase, auth.userKey),
    ]);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const month = events
      .filter((event) => {
        const d = new Date(event.sell_date);
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((acc, event) => acc + toNum(event.net_realized_pnl_krw), 0);
    const year = events
      .filter((event) => new Date(event.sell_date).getFullYear() === y)
      .reduce((acc, event) => acc + toNum(event.net_realized_pnl_krw), 0);
    const last30d = events
      .filter((event) => isInLastDays(event.sell_date, 30))
      .reduce((acc, event) => acc + toNum(event.net_realized_pnl_krw), 0);
    const total = events.reduce((acc, event) => acc + toNum(event.net_realized_pnl_krw), 0);
    const allocated = allocations.reduce((acc, allocation) => acc + toNum(allocation.amount_krw), 0);
    const bySymbolMap = new Map<string, { symbol: string; name?: string | null; realized: number; wins: number; losses: number; rates: number[] }>();
    events.forEach((event) => {
      const key = event.symbol.toUpperCase();
      const existing = bySymbolMap.get(key) ?? {
        symbol: key,
        name: event.name,
        realized: 0,
        wins: 0,
        losses: 0,
        rates: [],
      };
      const pnl = toNum(event.net_realized_pnl_krw);
      existing.realized += pnl;
      if (pnl >= 0) existing.wins += 1;
      else existing.losses += 1;
      if (event.realized_pnl_rate != null) existing.rates.push(toNum(event.realized_pnl_rate));
      bySymbolMap.set(key, existing);
    });
    const goalProgress = goals.map((goal) => {
      const allocatedKrw = toNum(goal.current_allocated_krw);
      const targetKrw = Math.max(0, toNum(goal.target_amount_krw));
      return {
        goalId: goal.id,
        goalName: goal.goal_name,
        allocated: allocatedKrw,
        target: targetKrw,
        progressRate: targetKrw > 0 ? (allocatedKrw / targetKrw) * 100 : 0,
      };
    });
    const goalMap = new Map(goals.map((goal) => [goal.id, goal.goal_name]));
    const result: RealizedPnlSummaryResponseBody = {
      ok: true,
      periods: { month, year, last30d, total },
      totals: {
        allocated,
        unallocated: total - allocated,
      },
      bySymbol: Array.from(bySymbolMap.values())
        .map((row) => ({
          symbol: row.symbol,
          name: row.name,
          realizedPnlKrw: row.realized,
          wins: row.wins,
          losses: row.losses,
          avgRealizedPnlRate: row.rates.length > 0 ? row.rates.reduce((a, b) => a + b, 0) / row.rates.length : undefined,
        }))
        .sort((a, b) => b.realizedPnlKrw - a.realizedPnlKrw),
      recentEvents: events.slice(0, 20).map((event) => mapEvent(event, goalMap.get(event.linked_goal_id ?? ''))),
      goalProgress: goalProgress.sort((a, b) => b.progressRate - a.progressRate),
    };
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
