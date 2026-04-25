import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { deleteFinancialGoal, updateFinancialGoal } from '@office-unify/supabase-access';
import { mapGoal, toNum } from '@/lib/server/realizedPnlGoals';

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
  if (body.goalName != null) patch.goal_name = String(body.goalName).trim();
  if (body.goalType != null) patch.goal_type = String(body.goalType).trim();
  if (body.targetAmountKrw != null) {
    const n = toNum(body.targetAmountKrw, NaN);
    if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: 'targetAmountKrw must be > 0' }, { status: 400 });
    patch.target_amount_krw = n;
  }
  if (body.targetDate !== undefined) patch.target_date = body.targetDate ? String(body.targetDate) : null;
  if (body.priority != null) patch.priority = String(body.priority);
  if (body.status != null) patch.status = String(body.status);
  if (body.memo !== undefined) patch.memo = body.memo ? String(body.memo) : null;
  try {
    const row = await updateFinancialGoal(supabase, auth.userKey, (await context.params).id, patch);
    return NextResponse.json({ ok: true, goal: mapGoal(row) });
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
    await deleteFinancialGoal(supabase, auth.userKey, (await context.params).id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
