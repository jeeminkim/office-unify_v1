import { NextResponse } from 'next/server';
import type { MonthlyJudgmentReview } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { buildMonthlyJudgmentReview } from '@/lib/server/monthlyJudgmentReview';
import { createActionItemsFromMonthlyReview } from '@/lib/server/monthlyJudgmentReviewService';

type ActionItemsBody = {
  review?: MonthlyJudgmentReview;
  retrospectiveId?: string;
  confirm?: boolean;
  days?: number;
  startDate?: string;
  endDate?: string;
};

function isMonthlyReviewShape(v: unknown): v is MonthlyJudgmentReview {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return Boolean(o.window && o.nextMonthRules);
}

/**
 * POST /api/judgment-review/monthly/action-items — 확인 후 Action Items 저장.
 */
export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  let body: ActionItemsBody = {};
  try {
    body = (await req.json()) as ActionItemsBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      { ok: false, error: 'confirm:true required before creating action items' },
      { status: 400 },
    );
  }

  let review: MonthlyJudgmentReview;
  if (body.review && isMonthlyReviewShape(body.review)) {
    review = body.review;
  } else {
    review = await buildMonthlyJudgmentReview({
      supabase,
      userKey: auth.userKey as string,
      days: body.days ?? 30,
      startDate: body.startDate,
      endDate: body.endDate,
      readOnlyPreview: true,
    });
  }

  const result = await createActionItemsFromMonthlyReview({
    supabase,
    userKey: auth.userKey as string,
    review,
    retrospectiveId: body.retrospectiveId,
  });

  if (!result.ok) {
    return NextResponse.json(result.body, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    created: result.created,
    skipped: result.skipped,
    items: result.items,
  });
}
