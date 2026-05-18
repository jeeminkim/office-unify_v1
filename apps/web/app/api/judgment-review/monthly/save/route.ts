import { NextResponse } from 'next/server';
import type { MonthlyJudgmentReview } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  buildMonthlyJudgmentReview,
  buildMonthlyJudgmentReviewWindowKey,
} from '@/lib/server/monthlyJudgmentReview';
import { saveMonthlyJudgmentReviewAsRetrospective } from '@/lib/server/monthlyJudgmentReviewService';

type SaveBody = {
  review?: MonthlyJudgmentReview;
  idempotencyKey?: string;
  days?: number;
  startDate?: string;
  endDate?: string;
};

function isMonthlyReviewShape(v: unknown): v is MonthlyJudgmentReview {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return Boolean(o.window && o.headline && o.metrics && o.qualityMeta);
}

/**
 * POST /api/judgment-review/monthly/save — 사용자 명시 저장만.
 */
export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  let body: SaveBody = {};
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let review: MonthlyJudgmentReview;
  if (body.review && isMonthlyReviewShape(body.review)) {
    review = body.review;
    review.qualityMeta = { ...review.qualityMeta, readOnlyPreview: false };
  } else {
    review = await buildMonthlyJudgmentReview({
      supabase,
      userKey: auth.userKey as string,
      days: body.days ?? 30,
      startDate: body.startDate,
      endDate: body.endDate,
      readOnlyPreview: false,
    });
  }

  const result = await saveMonthlyJudgmentReviewAsRetrospective({
    supabase,
    userKey: auth.userKey as string,
    review,
    idempotencyKey: body.idempotencyKey,
  });

  if (!result.ok) {
    return NextResponse.json(result.body, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    saved: result.saved,
    alreadyApplied: result.alreadyApplied,
    retrospectiveId: result.retrospectiveId,
    recommendedIdempotencyKey: result.recommendedIdempotencyKey,
    windowKey: buildMonthlyJudgmentReviewWindowKey(review.window),
  });
}
