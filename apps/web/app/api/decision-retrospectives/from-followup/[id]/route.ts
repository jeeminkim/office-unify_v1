import { NextResponse } from 'next/server';
import {
  decisionRetrospectiveTableMissingJson,
  isDecisionRetrospectiveTableMissingError,
} from '@/lib/server/decisionRetrospectiveSupabaseErrors';
import {
  isPostgresUniqueViolationError,
  isResearchFollowupTableMissingError,
  researchFollowupTableMissingJson,
} from '@/lib/server/researchFollowupSupabaseErrors';
import {
  buildDecisionRetroSeedFromFollowup,
  fetchDecisionRetroByUserSource,
  fetchResearchFollowupByIdForUserDecision,
  mapDecisionRetroDbRowToApi,
  type DecisionRetroDbRow,
} from '@/lib/server/decisionRetrospective';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const userKey = auth.userKey as string;
  const { id: followupId } = await ctx.params;

  const { row: fu, error: fuErr } = await fetchResearchFollowupByIdForUserDecision(supabase, userKey, followupId);
  if (fuErr) {
    if (isResearchFollowupTableMissingError(fuErr)) {
      return NextResponse.json(researchFollowupTableMissingJson(), { status: 503 });
    }
    if (isDecisionRetrospectiveTableMissingError(fuErr)) {
      return NextResponse.json(decisionRetrospectiveTableMissingJson(), { status: 503 });
    }
    return NextResponse.json(
      { ok: false, error: fuErr.message, actionHint: '잠시 후 다시 시도하세요.' },
      { status: 500 },
    );
  }
  if (!fu) return NextResponse.json({ error: 'Follow-up not found' }, { status: 404 });

  const existing = await fetchDecisionRetroByUserSource(supabase, userKey, 'research_followup', followupId);
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

  const seed = buildDecisionRetroSeedFromFollowup(fu, Date.now());
  const insertRow = {
    user_key: userKey,
    source_type: 'research_followup' as const,
    source_id: followupId,
    symbol: seed.symbol ?? null,
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
      const again = await fetchDecisionRetroByUserSource(supabase, userKey, 'research_followup', followupId);
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
