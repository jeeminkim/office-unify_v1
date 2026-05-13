import { NextResponse } from 'next/server';
import {
  decisionRetrospectiveTableMissingJson,
  isDecisionRetrospectiveTableMissingError,
} from '@/lib/server/decisionRetrospectiveSupabaseErrors';
import {
  fetchDecisionRetroByIdForUser,
  mapDecisionRetroDbRowToApi,
  parseDecisionRetroOutcome,
  parseDecisionRetroQualitySignals,
  parseDecisionRetroStatus,
  type DecisionRetroDbRow,
} from '@/lib/server/decisionRetrospective';
import { sanitizeDecisionRetroInput } from '@/lib/server/decisionRetrospectiveSanitize';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const userKey = auth.userKey as string;
  const { id } = await ctx.params;

  let body: {
    status?: unknown;
    outcome?: unknown;
    qualitySignals?: unknown;
    whatWorked?: unknown;
    whatDidNotWork?: unknown;
    nextRule?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const hasPatch =
    body.status !== undefined ||
    body.outcome !== undefined ||
    body.qualitySignals !== undefined ||
    body.whatWorked !== undefined ||
    body.whatDidNotWork !== undefined ||
    body.nextRule !== undefined;
  if (!hasPatch) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

  const { row, error: fetchErr } = await fetchDecisionRetroByIdForUser(supabase, userKey, id);
  if (fetchErr) {
    if (isDecisionRetrospectiveTableMissingError(fetchErr)) {
      return NextResponse.json(decisionRetrospectiveTableMissingJson(), { status: 503 });
    }
    return NextResponse.json(
      { ok: false, error: fetchErr.message, actionHint: '잠시 후 다시 시도하세요.' },
      { status: 500 },
    );
  }
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.status !== undefined) {
    const st = parseDecisionRetroStatus(body.status);
    if (!st) {
      return NextResponse.json(
        { error: 'Invalid status', actionHint: 'Use draft, reviewed, learned, or archived.' },
        { status: 400 },
      );
    }
    updatePayload.status = st;
  }
  if (body.outcome !== undefined) {
    const oc = parseDecisionRetroOutcome(body.outcome);
    if (!oc) {
      return NextResponse.json(
        { error: 'Invalid outcome', actionHint: 'Use helpful, partially_helpful, not_helpful, or unknown.' },
        { status: 400 },
      );
    }
    updatePayload.outcome = oc;
  }
  if (body.qualitySignals !== undefined) {
    const qs = parseDecisionRetroQualitySignals(body.qualitySignals);
    if (!qs) {
      return NextResponse.json(
        { error: 'Invalid qualitySignals', actionHint: 'Send an array of known quality signal codes only.' },
        { status: 400 },
      );
    }
    updatePayload.quality_signals = qs;
  }

  const textSan = sanitizeDecisionRetroInput({
    whatWorked: body.whatWorked as string | undefined,
    whatDidNotWork: body.whatDidNotWork as string | undefined,
    nextRule: body.nextRule as string | undefined,
  });
  if (body.whatWorked !== undefined) {
    updatePayload.what_worked = textSan.whatWorked ?? null;
  }
  if (body.whatDidNotWork !== undefined) {
    updatePayload.what_did_not_work = textSan.whatDidNotWork ?? null;
  }
  if (body.nextRule !== undefined) {
    updatePayload.next_rule = textSan.nextRule ?? null;
  }

  const upd = await supabase
    .from('web_decision_retrospectives')
    .update(updatePayload)
    .eq('user_key', userKey)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (upd.error) {
    if (isDecisionRetrospectiveTableMissingError(upd.error)) {
      return NextResponse.json(decisionRetrospectiveTableMissingJson(), { status: 503 });
    }
    return NextResponse.json(
      { ok: false, error: upd.error.message, actionHint: '잠시 후 다시 시도하세요.' },
      { status: 500 },
    );
  }
  const out = upd.data as DecisionRetroDbRow | null;
  if (!out) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, item: mapDecisionRetroDbRowToApi(out) });
}
