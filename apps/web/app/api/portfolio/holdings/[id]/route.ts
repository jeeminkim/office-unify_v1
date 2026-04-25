import { NextResponse } from 'next/server';
import { requirePersonaChatAuth } from '@/lib/server/persona-chat-auth';
import { getServiceSupabase } from '@/lib/server/supabase-service';
import {
  deletePortfolioHolding,
  upsertPortfolioHolding,
} from '@office-unify/supabase-access';
import type { PortfolioLedgerHoldingInput } from '@office-unify/shared-types';

type Params = { params: Promise<{ id: string }> };

function parseHoldingId(rawId: string): { market: 'KR' | 'US'; symbol: string } | null {
  const [marketRaw, ...rest] = decodeURIComponent(rawId).split(':');
  const symbol = rest.join(':').trim().toUpperCase();
  const market = marketRaw === 'KR' || marketRaw === 'US' ? marketRaw : null;
  if (!market || !symbol) return null;
  return { market, symbol };
}

export async function PATCH(req: Request, context: Params) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const parsed = parseHoldingId((await context.params).id);
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid id. Use market:symbol.' }, { status: 400 });
  }
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }
  let body: Partial<PortfolioLedgerHoldingInput> & { name?: string };
  try {
    body = (await req.json()) as Partial<PortfolioLedgerHoldingInput> & { name?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const qty = body.qty == null ? undefined : Number(body.qty);
  const avg = body.avg_price == null ? undefined : Number(body.avg_price);
  if (qty != null && (!Number.isFinite(qty) || qty < 0)) {
    return NextResponse.json({ error: 'qty must be >= 0' }, { status: 400 });
  }
  if (avg != null && (!Number.isFinite(avg) || avg <= 0)) {
    return NextResponse.json({ error: 'avg_price must be > 0' }, { status: 400 });
  }
  try {
    await upsertPortfolioHolding(supabase, auth.userKey, {
      market: parsed.market,
      symbol: parsed.symbol,
      name: (body.name ?? parsed.symbol).trim(),
      sector: body.sector ?? null,
      investment_memo: body.investment_memo ?? null,
      qty: qty ?? null,
      avg_price: avg ?? null,
      target_price: body.target_price == null ? null : Number(body.target_price),
      judgment_memo: body.judgment_memo ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: Params) {
  const auth = await requirePersonaChatAuth();
  if (!auth.ok) return auth.response;
  const parsed = parseHoldingId((await context.params).id);
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid id. Use market:symbol.' }, { status: 400 });
  }
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 },
    );
  }
  try {
    await deletePortfolioHolding(supabase, auth.userKey, parsed.market, parsed.symbol);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

