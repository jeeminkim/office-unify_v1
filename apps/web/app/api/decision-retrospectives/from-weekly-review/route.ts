import { NextResponse } from 'next/server';
import type { PbWeeklyReview } from '@office-unify/shared-types';
import {
  decisionRetrospectiveTableMissingJson,
  isDecisionRetrospectiveTableMissingError,
} from '@/lib/server/decisionRetrospectiveSupabaseErrors';
import { isPostgresUniqueViolationError } from '@/lib/server/researchFollowupSupabaseErrors';
import {
  buildDecisionRetroSeedFromPbWeeklyReview,
  fetchDecisionRetroByUserSource,
  mapDecisionRetroDbRowToApi,
  type DecisionRetroDbRow,
} from '@/lib/server/decisionRetrospective';
import {
  buildPbWeeklyReviewFromContext,
  buildPrivateBankerWeeklyReviewContext,
} from '@/lib/server/privateBankerWeeklyReview';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';

function isPbWeeklyReviewShape(v: unknown): v is PbWeeklyReview {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.weekOf !== 'string' || !o.weekOf) return false;
  const sec = o.sections;
  if (!sec || typeof sec !== 'object') return false;
  const s = sec as Record<string, unknown>;
  return Array.isArray(s.candidates) && Array.isArray(s.followups) && Array.isArray(s.risks) && Array.isArray(s.questions);
}

export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const userKey = auth.userKey as string;

  let body: { preview?: unknown } = {};
  try {
    body = (await req.json()) as { preview?: unknown };
  } catch {
    body = {};
  }

  let preview: PbWeeklyReview | null = null;
  if (body.preview !== undefined) {
    if (!isPbWeeklyReviewShape(body.preview)) {
      return NextResponse.json({ error: 'Invalid preview shape' }, { status: 400 });
    }
    preview = body.preview;
  }

  if (!preview) {
    try {
      const ctx = await buildPrivateBankerWeeklyReviewContext(supabase, userKey);
      preview = buildPbWeeklyReviewFromContext(ctx);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  const sourceId = preview.weekOf;
  const existing = await fetchDecisionRetroByUserSource(supabase, userKey, 'pb_weekly_review', sourceId);
  if (existing.error) {
    if (isDecisionRetrospectiveTableMissingError(existing.error)) {
      return NextResponse.json(decisionRetrospectiveTableMissingJson(), { status: 503 });
    }
    return NextResponse.json(
      { ok: false, error: existing.error.message, actionHint: '잠시 후 다시 시도하세요.' },
      { status: 500 },
    );
  }
  if (existing.row) {
    return NextResponse.json({ ok: true, item: mapDecisionRetroDbRowToApi(existing.row), deduped: true });
  }

  const seed = buildDecisionRetroSeedFromPbWeeklyReview(preview);
  const insertRow = {
    user_key: userKey,
    source_type: 'pb_weekly_review' as const,
    source_id: sourceId,
    symbol: null as string | null,
    title: seed.title,
    summary: seed.summary,
    status: 'draft',
    outcome: 'unknown',
    quality_signals: [] as string[],
    detail_json: seed.detailJson,
    updated_at: new Date().toISOString(),
  };

  const ins = await supabase.from('web_decision_retrospectives').insert(insertRow).select('*').maybeSingle();
  if (ins.error) {
    if (isDecisionRetrospectiveTableMissingError(ins.error)) {
      return NextResponse.json(decisionRetrospectiveTableMissingJson(), { status: 503 });
    }
    if (isPostgresUniqueViolationError(ins.error)) {
      const again = await fetchDecisionRetroByUserSource(supabase, userKey, 'pb_weekly_review', sourceId);
      if (again.row) {
        return NextResponse.json({ ok: true, item: mapDecisionRetroDbRowToApi(again.row), deduped: true });
      }
    }
    return NextResponse.json(
      { ok: false, error: ins.error.message, actionHint: '잠시 후 다시 시도하세요.' },
      { status: 500 },
    );
  }
  const row = ins.data as DecisionRetroDbRow | null;
  if (!row) {
    return NextResponse.json({ ok: false, error: 'Insert returned no row' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, item: mapDecisionRetroDbRowToApi(row), deduped: false });
}
