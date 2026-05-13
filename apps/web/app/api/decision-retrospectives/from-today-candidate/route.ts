import { NextResponse } from 'next/server';
import {
  decisionRetrospectiveTableMissingJson,
  isDecisionRetrospectiveTableMissingError,
} from '@/lib/server/decisionRetrospectiveSupabaseErrors';
import { isPostgresUniqueViolationError } from '@/lib/server/researchFollowupSupabaseErrors';
import {
  buildDecisionRetroSeedFromTodayCandidate,
  fetchDecisionRetroByUserSource,
  mapDecisionRetroDbRowToApi,
  type DecisionRetroDbRow,
} from '@/lib/server/decisionRetrospective';
import {
  parseTodayCandidateForDecisionRetro,
  TODAY_RETRO_ACTION_HINT_PAYLOAD,
  TODAY_RETRO_CANDIDATE_MAX_BODY_CHARS,
} from '@/lib/server/decisionRetrospectiveTodayCandidatePayload';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';

export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const userKey = auth.userKey as string;

  const text = await req.text();
  if (text.length > TODAY_RETRO_CANDIDATE_MAX_BODY_CHARS) {
    return NextResponse.json(
      { ok: false, error: 'Request body too large', actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON', actionHint: TODAY_RETRO_ACTION_HINT_PAYLOAD },
      { status: 400 },
    );
  }

  const parsed = parseTodayCandidateForDecisionRetro(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error, actionHint: parsed.actionHint }, { status: 400 });
  }
  const candidate = parsed.candidate;
  const sourceId = candidate.candidateId;

  const existing = await fetchDecisionRetroByUserSource(supabase, userKey, 'today_candidate', sourceId);
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

  const seed = buildDecisionRetroSeedFromTodayCandidate(candidate);
  const insertRow = {
    user_key: userKey,
    source_type: 'today_candidate' as const,
    source_id: sourceId,
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
      const again = await fetchDecisionRetroByUserSource(supabase, userKey, 'today_candidate', sourceId);
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
