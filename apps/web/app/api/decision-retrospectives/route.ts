import { NextResponse } from 'next/server';
import type { DecisionRetrospectivesQualityMeta, DecisionRetroOutcome, DecisionRetroStatus } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import {
  decisionRetrospectiveTableMissingJson,
  isDecisionRetrospectiveTableMissingError,
} from '@/lib/server/decisionRetrospectiveSupabaseErrors';
import {
  computeDecisionRetrospectivesQualityMeta,
  mapDecisionRetroDbRowToApi,
  parseDecisionRetroSourceType,
  parseDecisionRetroStatus,
  parseDecisionRetroOutcome,
  parseDecisionRetroQualitySignals,
  type DecisionRetroDbRow,
  type DecisionRetroStatsRow,
} from '@/lib/server/decisionRetrospective';
import { sanitizeDecisionRetroInput, stripDecisionRetroControlChars } from '@/lib/server/decisionRetrospectiveSanitize';
import { getServiceSupabase } from '@/lib/server/supabase-service';

function truncateField(raw: string, max: number): string {
  const s = stripDecisionRetroControlChars(String(raw ?? '')).trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

export async function GET(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const userKey = auth.userKey as string;
  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? undefined;
  const symbol = url.searchParams.get('symbol') ?? undefined;
  const sourceType = url.searchParams.get('sourceType') ?? undefined;

  let listQuery = supabase.from('web_decision_retrospectives').select('*').eq('user_key', userKey);
  if (status) listQuery = listQuery.eq('status', status);
  if (symbol) listQuery = listQuery.eq('symbol', symbol);
  if (sourceType) listQuery = listQuery.eq('source_type', sourceType);

  const statsQuery = supabase
    .from('web_decision_retrospectives')
    .select('status, outcome, quality_signals, created_at')
    .eq('user_key', userKey)
    .limit(2000);

  const [listRes, statsRes] = await Promise.all([
    listQuery.order('created_at', { ascending: false }).limit(200),
    statsQuery,
  ]);

  if (listRes.error) {
    if (isDecisionRetrospectiveTableMissingError(listRes.error)) {
      return NextResponse.json(decisionRetrospectiveTableMissingJson(), { status: 503 });
    }
    return NextResponse.json(
      { ok: false, error: listRes.error.message, actionHint: '잠시 후 다시 시도하세요.' },
      { status: 500 },
    );
  }

  let qualityMeta: { decisionRetrospectives: DecisionRetrospectivesQualityMeta } | Record<string, never> = {};
  if (!statsRes.error && Array.isArray(statsRes.data)) {
    qualityMeta = {
      decisionRetrospectives: computeDecisionRetrospectivesQualityMeta(
        statsRes.data as DecisionRetroStatsRow[],
        Date.now(),
      ),
    };
  } else if (statsRes.error && isDecisionRetrospectiveTableMissingError(statsRes.error)) {
    return NextResponse.json(decisionRetrospectiveTableMissingJson(), { status: 503 });
  } else if (statsRes.error && !isDecisionRetrospectiveTableMissingError(statsRes.error)) {
    qualityMeta = {
      decisionRetrospectives: computeDecisionRetrospectivesQualityMeta(
        (listRes.data ?? []) as unknown as DecisionRetroStatsRow[],
        Date.now(),
      ),
    };
  }

  const items = (listRes.data ?? []).map((r) => mapDecisionRetroDbRowToApi(r as DecisionRetroDbRow));
  return NextResponse.json({ ok: true, items, qualityMeta });
}

export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const userKey = auth.userKey as string;

  let body: {
    sourceType?: unknown;
    sourceId?: unknown;
    symbol?: unknown;
    title?: unknown;
    summary?: unknown;
    status?: unknown;
    outcome?: unknown;
    qualitySignals?: unknown;
    whatWorked?: unknown;
    whatDidNotWork?: unknown;
    nextRule?: unknown;
    /** Additive: `pb_coach` when saving from PB 복기 코치 초안. */
    detailSeed?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const st = parseDecisionRetroSourceType(body.sourceType);
  if (!st) {
    return NextResponse.json(
      { error: 'Invalid sourceType', actionHint: 'Use manual, today_candidate, research_followup, pb_weekly_review, or pb_message.' },
      { status: 400 },
    );
  }

  const title = typeof body.title === 'string' ? truncateField(body.title, 200) : '';
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });

  const summary =
    typeof body.summary === 'string' ? truncateField(body.summary, 2000) : '';
  const sourceId =
    typeof body.sourceId === 'string' && body.sourceId.trim().length > 0 ? body.sourceId.trim() : null;
  const symbol =
    typeof body.symbol === 'string' && body.symbol.trim().length > 0 ? truncateField(body.symbol, 32) : null;

  let insStatus: DecisionRetroStatus = 'draft';
  if (body.status !== undefined) {
    const p = parseDecisionRetroStatus(body.status);
    if (!p) {
      return NextResponse.json(
        { error: 'Invalid status', actionHint: 'Use draft, reviewed, learned, or archived.' },
        { status: 400 },
      );
    }
    insStatus = p;
  }
  let insOutcome: DecisionRetroOutcome = 'unknown';
  if (body.outcome !== undefined) {
    const p = parseDecisionRetroOutcome(body.outcome);
    if (!p) {
      return NextResponse.json(
        { error: 'Invalid outcome', actionHint: 'Use helpful, partially_helpful, not_helpful, or unknown.' },
        { status: 400 },
      );
    }
    insOutcome = p;
  }
  let qs: string[] = [];
  if (body.qualitySignals !== undefined) {
    const parsed = parseDecisionRetroQualitySignals(body.qualitySignals);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid qualitySignals', actionHint: 'Send an array of known quality signal codes only.' },
        { status: 400 },
      );
    }
    qs = parsed;
  }

  const detailSeedRaw = typeof body.detailSeed === 'string' ? body.detailSeed.trim() : '';
  const detailSeed = detailSeedRaw === 'pb_coach' ? 'pb_coach' : 'manual';

  const textFields = sanitizeDecisionRetroInput({
    whatWorked: body.whatWorked !== undefined ? (typeof body.whatWorked === 'string' ? body.whatWorked : null) : undefined,
    whatDidNotWork:
      body.whatDidNotWork !== undefined ? (typeof body.whatDidNotWork === 'string' ? body.whatDidNotWork : null) : undefined,
    nextRule: body.nextRule !== undefined ? (typeof body.nextRule === 'string' ? body.nextRule : null) : undefined,
  });

  const insertRow = {
    user_key: userKey,
    source_type: st,
    source_id: sourceId,
    symbol,
    title,
    summary,
    status: insStatus,
    outcome: insOutcome,
    quality_signals: qs,
    what_worked: textFields.whatWorked ?? null,
    what_did_not_work: textFields.whatDidNotWork ?? null,
    next_rule: textFields.nextRule ?? null,
    detail_json: { seed: detailSeed },
    updated_at: new Date().toISOString(),
  };

  const ins = await supabase.from('web_decision_retrospectives').insert(insertRow).select('*').maybeSingle();
  if (ins.error) {
    if (isDecisionRetrospectiveTableMissingError(ins.error)) {
      return NextResponse.json(decisionRetrospectiveTableMissingJson(), { status: 503 });
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
  return NextResponse.json({ ok: true, item: mapDecisionRetroDbRowToApi(row) });
}
