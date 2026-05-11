import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  normalizeResearchFollowupDedupeTitle,
  RESEARCH_FOLLOWUP_DEDUPE_POLICY_SUMMARY,
  type ResearchFollowupRowDto,
  type ResearchFollowupSummary,
} from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { logResearchFollowupOpsEvent } from '@/lib/server/researchFollowupOps';
import {
  isPostgresUniqueViolationError,
  isResearchFollowupTableMissingError,
  researchFollowupTableMissingJson,
} from '@/lib/server/researchFollowupSupabaseErrors';
import {
  computeResearchFollowupSummary,
  findResearchFollowupDuplicate,
  type FollowupStatsRow,
} from '@/lib/server/researchFollowupTracking';
import { getServiceSupabase } from '@/lib/server/supabase-service';

function duplicateFingerprint(userKey: string, researchRequestId: string | null, title: string, symbol: string | null) {
  const h = createHash('sha256')
    .update(`${researchRequestId ?? ''}|${normalizeResearchFollowupDedupeTitle(title)}|${symbol ?? ''}`)
    .digest('hex')
    .slice(0, 20);
  return `research_followup_duplicate_detected:${userKey}:${h}`;
}

export async function GET(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? undefined;
  const symbol = url.searchParams.get('symbol') ?? undefined;
  const category = url.searchParams.get('category') ?? undefined;
  const userKey = auth.userKey as string;

  let listQuery = supabase.from('web_research_followup_items').select('*').eq('user_key', userKey);
  if (status) listQuery = listQuery.eq('status', status);
  if (symbol) listQuery = listQuery.eq('symbol', symbol);
  if (category) listQuery = listQuery.eq('category', category);

  const statsQuery = supabase
    .from('web_research_followup_items')
    .select('status, category, priority, updated_at, selected_for_pb, pb_session_id, pb_turn_id')
    .eq('user_key', userKey)
    .limit(2000);

  const [listRes, statsRes] = await Promise.all([
    listQuery.order('created_at', { ascending: false }).limit(200),
    statsQuery,
  ]);

  if (listRes.error) {
    if (isResearchFollowupTableMissingError(listRes.error)) {
      return NextResponse.json(researchFollowupTableMissingJson(), { status: 503 });
    }
    return NextResponse.json(
      { ok: false, error: listRes.error.message, actionHint: '잠시 후 다시 시도하거나 운영 로그를 확인하세요.' },
      { status: 500 },
    );
  }

  let summary: ResearchFollowupSummary | undefined;
  if (!statsRes.error && Array.isArray(statsRes.data)) {
    summary = computeResearchFollowupSummary(statsRes.data as FollowupStatsRow[]);
  } else if (statsRes.error && isResearchFollowupTableMissingError(statsRes.error)) {
    return NextResponse.json(researchFollowupTableMissingJson(), { status: 503 });
  } else if (!statsRes.error && statsRes.data == null) {
    summary = computeResearchFollowupSummary((listRes.data ?? []) as unknown as FollowupStatsRow[]);
  } else if (statsRes.error && !isResearchFollowupTableMissingError(statsRes.error)) {
    summary = computeResearchFollowupSummary((listRes.data ?? []) as unknown as FollowupStatsRow[]);
  }

  return NextResponse.json({
    ok: true,
    items: (listRes.data ?? []) as ResearchFollowupRowDto[],
    qualityMeta: summary ? { followups: { summary } } : {},
  });
}

export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  let body: {
    title: string;
    category?: string;
    priority?: string;
    researchRequestId?: string;
    symbol?: string;
    companyName?: string;
    detailJson?: Record<string, unknown>;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 });
  const userKey = auth.userKey as string;
  const title = body.title.trim();
  const researchRequestId = body.researchRequestId?.trim() ? body.researchRequestId.trim() : null;
  const symbol = body.symbol?.trim() ? body.symbol.trim() : null;

  const dup = await findResearchFollowupDuplicate(supabase, {
    userKey,
    researchRequestId,
    title,
    symbol,
  });
  if (dup) {
    const { data: existing, error: exErr } = await supabase
      .from('web_research_followup_items')
      .select('*')
      .eq('id', dup.id)
      .eq('user_key', userKey)
      .maybeSingle();
    if (!exErr && existing) {
      void logResearchFollowupOpsEvent({
        userKey,
        code: 'research_followup_duplicate_detected',
        fingerprint: duplicateFingerprint(userKey, researchRequestId, title, symbol),
        message: 'Duplicate research follow-up save skipped',
        detail: { followupIdPrefix: dup.id.slice(0, 8), duplicate: true },
      });
      return NextResponse.json({
        ok: true,
        item: existing as ResearchFollowupRowDto,
        duplicate: true,
        qualityMeta: {
          followups: { duplicate: true, dedupePolicy: RESEARCH_FOLLOWUP_DEDUPE_POLICY_SUMMARY },
        },
      });
    }
  }

  const { data, error } = await supabase
    .from('web_research_followup_items')
    .insert({
      user_key: userKey,
      research_request_id: researchRequestId,
      title,
      detail_json: body.detailJson ?? {},
      category: body.category ?? 'other',
      priority: body.priority ?? 'medium',
      status: 'open',
      source: 'research_center',
      symbol,
      company_name: body.companyName ?? null,
    })
    .select('*')
    .maybeSingle();
  if (error) {
    if (isResearchFollowupTableMissingError(error)) {
      return NextResponse.json(researchFollowupTableMissingJson(), { status: 503 });
    }
    if (isPostgresUniqueViolationError(error)) {
      const dupAfter = await findResearchFollowupDuplicate(supabase, {
        userKey,
        researchRequestId,
        title,
        symbol,
      });
      if (dupAfter) {
        const { data: existing, error: exErr } = await supabase
          .from('web_research_followup_items')
          .select('*')
          .eq('id', dupAfter.id)
          .eq('user_key', userKey)
          .maybeSingle();
        if (!exErr && existing) {
          void logResearchFollowupOpsEvent({
            userKey,
            code: 'research_followup_duplicate_detected',
            fingerprint: duplicateFingerprint(userKey, researchRequestId, title, symbol),
            message: 'Duplicate research follow-up save skipped (unique index)',
            detail: { followupIdPrefix: dupAfter.id.slice(0, 8), duplicate: true },
          });
          return NextResponse.json({
            ok: true,
            item: existing as ResearchFollowupRowDto,
            duplicate: true,
            qualityMeta: {
              followups: { duplicate: true, dedupePolicy: RESEARCH_FOLLOWUP_DEDUPE_POLICY_SUMMARY },
            },
          });
        }
      }
    }
    return NextResponse.json(
      { ok: false, error: error.message, actionHint: '잠시 후 다시 시도하거나 운영 로그를 확인하세요.' },
      { status: 500 },
    );
  }

  if (data?.id) {
    void logResearchFollowupOpsEvent({
      userKey,
      code: 'research_followup_saved',
      fingerprint: `research_followup_saved:${userKey}:${data.id}`,
      message: 'Research follow-up saved',
      detail: { followupIdPrefix: String(data.id).slice(0, 8) },
    });
  }

  return NextResponse.json({ ok: true, item: data, qualityMeta: { followups: { saved: true } } });
}
