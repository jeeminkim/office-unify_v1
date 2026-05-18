import { NextResponse } from 'next/server';
import type { ActionItemCreateRequest, ActionItemListResponse } from '@office-unify/shared-types';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import { listActionItemsForUser } from '@office-unify/supabase-access';
import {
  actionItemTableMissingJson,
  computeActionItemSummary,
  createActionItemWithDedupe,
  isActionItemTableMissingError,
} from '@/lib/server/actionItemService';

export async function GET(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? undefined;
  const sourceType = url.searchParams.get('sourceType') ?? undefined;
  const symbol = url.searchParams.get('symbol') ?? undefined;

  try {
    const rows = await listActionItemsForUser(supabase, auth.userKey as string, {
      status,
      sourceType,
      symbol,
      limit: 300,
    });
    const summary = computeActionItemSummary(rows);
    const res: ActionItemListResponse = {
      ok: true,
      items: rows.map((r) => ({
        id: r.id,
        user_key: r.user_key,
        title: r.title,
        description: r.description,
        status: r.status as ActionItemListResponse['items'][0]['status'],
        priority: r.priority as ActionItemListResponse['items'][0]['priority'],
        source_type: r.source_type as ActionItemListResponse['items'][0]['source_type'],
        source_id: r.source_id,
        source_label: r.source_label,
        source_href: r.source_href,
        symbol: r.symbol,
        links_json: (r.links_json ?? {}) as ActionItemListResponse['items'][0]['links_json'],
        detail_json: r.detail_json ?? {},
        idempotency_key: r.idempotency_key,
        dedupe_title_norm: r.dedupe_title_norm,
        created_at: r.created_at,
        updated_at: r.updated_at,
        completed_at: r.completed_at,
      })),
      total: rows.length,
      qualityMeta: { summary },
    };
    return NextResponse.json(res);
  } catch (e: unknown) {
    if (isActionItemTableMissingError(e)) {
      return NextResponse.json(actionItemTableMissingJson(), { status: 503 });
    }
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  let body: ActionItemCreateRequest | { items?: ActionItemCreateRequest[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const batch = Array.isArray((body as { items?: ActionItemCreateRequest[] }).items)
    ? (body as { items: ActionItemCreateRequest[] }).items
    : [body as ActionItemCreateRequest];

  try {
    const results = [];
    for (const item of batch) {
      const r = await createActionItemWithDedupe(supabase, auth.userKey as string, item);
      results.push(r);
    }
    if (batch.length === 1) {
      return NextResponse.json({ ok: true, item: results[0]!.item, deduped: results[0]!.deduped });
    }
    return NextResponse.json({ ok: true, items: results, created: results.filter((x) => !x.deduped).length });
  } catch (e: unknown) {
    if (isActionItemTableMissingError(e)) {
      return NextResponse.json(actionItemTableMissingJson(), { status: 503 });
    }
    const message = e instanceof Error ? e.message : 'unknown';
    const status = message.startsWith('trade_instruction') || message.startsWith('title_') ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
