import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  buildMonthlyJudgmentReview,
  buildMonthlyJudgmentReviewIdempotencyKey,
  buildMonthlyJudgmentReviewWindowKey,
  resolveJudgmentReviewWindow,
} from '@/lib/server/monthlyJudgmentReview';

/**
 * GET /api/judgment-review/monthly — read-only preview, DB write 없음.
 */
export async function GET(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const url = new URL(req.url);
  const days = url.searchParams.get('days') ? Number(url.searchParams.get('days')) : 30;
  const startDate = url.searchParams.get('startDate') ?? undefined;
  const endDate = url.searchParams.get('endDate') ?? undefined;

  try {
    const review = await buildMonthlyJudgmentReview({
      supabase,
      userKey: auth.userKey as string,
      days: Number.isFinite(days) ? days : 30,
      startDate,
      endDate,
      readOnlyPreview: true,
    });
    const window = resolveJudgmentReviewWindow({ days, startDate, endDate });
    const actionHints: string[] = [];
    for (const w of review.qualityMeta.warnings) {
      if (w.startsWith('table_missing:')) {
        const table = w.replace('table_missing:', '');
        actionHints.push(`SQL readiness: ${table} — docs/sql/APPLY_ORDER.md 참고`);
      }
    }
    return NextResponse.json({
      ok: true,
      review,
      windowKey: buildMonthlyJudgmentReviewWindowKey(window),
      recommendedIdempotencyKey: buildMonthlyJudgmentReviewIdempotencyKey(auth.userKey as string, window),
      sqlReadiness: actionHints.length ? { actionHints } : undefined,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
