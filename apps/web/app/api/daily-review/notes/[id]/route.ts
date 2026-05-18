import { NextResponse } from 'next/server';
import type { DailyReviewNotePatchRequest } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  dailyReviewNotesTableMissingResponse,
  isDailyReviewNotesTableMissingError,
  patchDailyReviewNote,
} from '@/lib/server/dailyReviewNotesStore';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const { id } = await ctx.params;
  let body: DailyReviewNotePatchRequest;
  try {
    body = (await req.json()) as DailyReviewNotePatchRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.status) {
    return NextResponse.json({ error: 'status_required' }, { status: 400 });
  }

  try {
    const note = await patchDailyReviewNote(supabase, auth.userKey as string, id, {
      status: body.status,
      dismissReason: body.dismissReason,
    });
    if (!note) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, note });
  } catch (e: unknown) {
    if (isDailyReviewNotesTableMissingError(e)) {
      return NextResponse.json(dailyReviewNotesTableMissingResponse(), { status: 503 });
    }
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
