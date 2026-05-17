import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { saveTodayCandidateFeedback } from '@/lib/server/todayCandidateFeedbackStore';
import type { TodayCandidateFeedbackRequest } from '@office-unify/shared-types';

/** POST /api/dashboard/today-candidates/feedback — 사용자 confirm 후 피드백만 저장 */
export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  let body: TodayCandidateFeedbackRequest;
  try {
    body = (await req.json()) as TodayCandidateFeedbackRequest;
  } catch {
    return NextResponse.json(
      { ok: false, action: 'hide_7d' as const, status: 'invalid_request' as const, actionHint: 'Invalid JSON.' },
      { status: 400 },
    );
  }

  const result = await saveTodayCandidateFeedback({
    supabase,
    userKey: String(auth.userKey),
    body,
  });

  if (result.status === 'invalid_request') {
    return NextResponse.json(result, { status: 400 });
  }
  if (result.status === 'table_missing') {
    return NextResponse.json(result, { status: 503 });
  }
  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
