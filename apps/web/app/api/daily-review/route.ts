import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { buildDailyReview } from '@/lib/server/dailyReviewService';

/** GET /api/daily-review — read-only, DB write 없음 */
export async function GET(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const url = new URL(req.url);
  const date = url.searchParams.get('date') ?? undefined;

  try {
    const review = await buildDailyReview(supabase, auth.userKey as string, date);
    return NextResponse.json(review);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
