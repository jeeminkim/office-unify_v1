import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  deleteGoalAllocation,
  listGoalAllocationsForUser,
  recalculateGoalAllocated,
} from '@office-unify/supabase-access';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, context: Params) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const allocationId = (await context.params).id;
  try {
    const allocations = await listGoalAllocationsForUser(supabase, auth.userKey);
    const matched = allocations.find((row) => row.id === allocationId);
    if (!matched) return NextResponse.json({ error: 'allocation not found.' }, { status: 404 });
    await deleteGoalAllocation(supabase, auth.userKey, allocationId);
    const goalAllocated = await recalculateGoalAllocated(supabase, auth.userKey, matched.goal_id);
    return NextResponse.json({ ok: true, goalAllocated });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
