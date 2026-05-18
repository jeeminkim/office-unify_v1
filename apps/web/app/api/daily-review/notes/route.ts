import { NextResponse } from 'next/server';
import type { DailyReviewNoteSaveRequest, DailyReviewNotesListResponse } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  isDailyReviewNotesTableMissingError,
  listDailyReviewNotes,
  saveDailyReviewNote,
} from '@/lib/server/dailyReviewNotesStore';

/** GET — read-only, DB write 없음 */
export async function GET(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const url = new URL(req.url);
  const date = url.searchParams.get('date') ?? undefined;
  const subjectType = url.searchParams.get('subjectType') ?? undefined;
  const statusParam = url.searchParams.get('status') ?? 'saved';

  try {
    const { notes, tableMissing } = await listDailyReviewNotes(supabase, auth.userKey as string, {
      date,
      subjectType: subjectType ?? undefined,
      status: statusParam === 'all' ? undefined : statusParam,
    });
    const res: DailyReviewNotesListResponse = {
      ok: true,
      notes,
      qualityMeta: { readOnly: true, tableMissing, notTradeInstruction: true },
    };
    return NextResponse.json(res);
  } catch (e: unknown) {
    if (isDailyReviewNotesTableMissingError(e)) {
      const res: DailyReviewNotesListResponse = {
        ok: true,
        notes: [],
        qualityMeta: { readOnly: true, tableMissing: true, notTradeInstruction: true },
      };
      return NextResponse.json(res);
    }
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** POST — 명시 저장만 */
export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  let body: DailyReviewNoteSaveRequest;
  try {
    body = (await req.json()) as DailyReviewNoteSaveRequest;
  } catch {
    return NextResponse.json({ ok: false, status: 'invalid_request', error: 'Invalid JSON' }, { status: 400 });
  }

  const result = await saveDailyReviewNote(supabase, auth.userKey as string, body);
  if (result.status === 'table_missing') {
    return NextResponse.json(result, { status: 503 });
  }
  if (result.status === 'invalid_request') {
    return NextResponse.json(result, { status: 400 });
  }
  if (result.status === 'error') {
    return NextResponse.json(result, { status: 500 });
  }
  const httpStatus = result.status === 'already_applied' ? 200 : 201;
  return NextResponse.json(result, { status: httpStatus });
}
