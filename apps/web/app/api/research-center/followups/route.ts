import { NextResponse } from 'next/server';
import type { ResearchFollowupRowDto } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import {
  isResearchFollowupTableMissingError,
  researchFollowupTableMissingJson,
} from '@/lib/server/researchFollowupSupabaseErrors';
import { getServiceSupabase } from '@/lib/server/supabase-service';

export async function GET(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? undefined;
  const symbol = url.searchParams.get('symbol') ?? undefined;
  let q = supabase.from('web_research_followup_items').select('*').eq('user_key', auth.userKey as string);
  if (status) q = q.eq('status', status);
  if (symbol) q = q.eq('symbol', symbol);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(200);
  if (error) {
    if (isResearchFollowupTableMissingError(error)) {
      return NextResponse.json(researchFollowupTableMissingJson(), { status: 503 });
    }
    return NextResponse.json(
      { ok: false, error: error.message, actionHint: '잠시 후 다시 시도하거나 운영 로그를 확인하세요.' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, items: (data ?? []) as ResearchFollowupRowDto[] });
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
  const { data, error } = await supabase
    .from('web_research_followup_items')
    .insert({
      user_key: auth.userKey as string,
      research_request_id: body.researchRequestId ?? null,
      title: body.title.trim(),
      detail_json: body.detailJson ?? {},
      category: body.category ?? 'other',
      priority: body.priority ?? 'medium',
      status: 'open',
      source: 'research_center',
      symbol: body.symbol ?? null,
      company_name: body.companyName ?? null,
    })
    .select('*')
    .maybeSingle();
  if (error) {
    if (isResearchFollowupTableMissingError(error)) {
      return NextResponse.json(researchFollowupTableMissingJson(), { status: 503 });
    }
    return NextResponse.json(
      { ok: false, error: error.message, actionHint: '잠시 후 다시 시도하거나 운영 로그를 확인하세요.' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, item: data });
}
