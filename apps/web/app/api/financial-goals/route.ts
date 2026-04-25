import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { insertFinancialGoal, listFinancialGoalsForUser } from '@office-unify/supabase-access';
import { mapGoal, toNum } from '@/lib/server/realizedPnlGoals';

export async function GET() {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  try {
    const rows = await listFinancialGoalsForUser(supabase, auth.userKey);
    return NextResponse.json({ ok: true, goals: rows.map(mapGoal) });
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
  const goalName = String(body.goalName ?? '').trim();
  const goalType = String(body.goalType ?? 'other').trim();
  const targetAmountKrw = toNum(body.targetAmountKrw, NaN);
  if (!goalName) return NextResponse.json({ error: 'goalName is required.' }, { status: 400 });
  if (!Number.isFinite(targetAmountKrw) || targetAmountKrw <= 0) {
    return NextResponse.json({ error: 'targetAmountKrw must be > 0.' }, { status: 400 });
  }
  try {
    const row = await insertFinancialGoal(supabase, auth.userKey, {
      goal_name: goalName,
      goal_type: goalType || 'other',
      target_amount_krw: targetAmountKrw,
      current_allocated_krw: 0,
      target_date: body.targetDate ? String(body.targetDate) : null,
      priority: String(body.priority ?? 'medium'),
      status: String(body.status ?? 'active'),
      memo: body.memo ? String(body.memo) : null,
    });
    return NextResponse.json({ ok: true, goal: mapGoal(row) });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
